// Synchronisatie met een privé GitHub-repo (route 2, zie docs/ARCHITECTURE.md → D13/D14).
//
// - Het toestel schrijft data/bijdehand.json (volledige back-up, verliesvrij).
// - Is de repo veranderd sinds dit toestel hem laatst zag (eerste keer, of een tweede kopie van de app schreef
//   ertussen), dan wordt die stand eerst samengevoegd (nieuwste wint, niets wordt verwijderd). Zo kan een kopie
//   met een oudere stand nooit nieuwere gegevens overschrijven (bug 2026-10-28, D31).
// - Claude schrijft alleen voorstellen in voorstellen/*.json. De app controleert ze met dezelfde regels
//   als bij "Voorstellen openen", past alles toe wat "ok" is en verwijdert het bestand (git bewaart het).
// - De sleutel (fine-grained token) staat alleen in de lokale meta-tabel. Die gaat nooit mee in een back-up.
import { applyRestore, exportBackup, parseBackup } from './backup';
import { applyProposals, parseProposals, type ApplyResult } from './claude';
import { db } from './db';
import { nowIso } from './util';

export const DATA_PATH = 'data/bijdehand.json';
export const PROPOSALS_DIR = 'voorstellen';

const K = { repo: 'sync:repo', token: 'sync:token', lastAt: 'sync:lastAt', lastPrint: 'sync:lastPrint', error: 'sync:error', applied: 'sync:applied', lastSha: 'sync:lastSha' } as const;

export interface SyncConfig { repo: string; token: string }

export interface SyncStatus {
  connected: boolean;
  repo: string;
  lastAt: string | null;
  error: string | null;
}

export interface SyncResult {
  /** Eerste keer: wat er uit de repo werd samengevoegd. */
  merged: { items: number; sources: number } | null;
  pushed: boolean;
  /** Toegepaste voorstellen van Claude (samengevoegd over alle bestanden). */
  applied: { updated: number; created: number; trashed: number; titles: string[] };
  undo: ApplyResult['undo'][];
  /** Voorstelbestanden die niet gelezen konden worden (blijven in de repo staan). */
  skippedFiles: string[];
}

// ---------- Instellingen ----------

async function meta(key: string): Promise<string | undefined> {
  return (await db.meta.get(key))?.value;
}
async function setMeta(key: string, value: string | null): Promise<void> {
  if (value === null) await db.meta.delete(key);
  else await db.meta.put({ key, value });
}

export async function getSyncConfig(): Promise<SyncConfig | null> {
  const [repo, token] = await Promise.all([meta(K.repo), meta(K.token)]);
  return repo && token ? { repo, token } : null;
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const [repo, token, lastAt, error] = await Promise.all([meta(K.repo), meta(K.token), meta(K.lastAt), meta(K.error)]);
  return { connected: !!(repo && token), repo: repo ?? '', lastAt: lastAt ?? null, error: error ?? null };
}

/** Ontkoppelen: sleutel weg. Gegevens op het toestel en in de repo blijven staan. */
export async function disconnect(): Promise<void> {
  await Promise.all([setMeta(K.token, null), setMeta(K.lastPrint, null), setMeta(K.error, null)]);
}

// ---------- GitHub-client (alleen wat nodig is) ----------

export class SyncError extends Error {}

type Fetch = typeof fetch;
let fetcher: Fetch = (...a) => fetch(...a);
/** Alleen voor tests. */
export function setFetcher(f: Fetch): void {
  fetcher = f;
}

function api(cfg: SyncConfig) {
  const base = `https://api.github.com/repos/${cfg.repo}`;
  const headers = { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const call = async (method: string, path: string, body?: unknown): Promise<{ status: number; json: unknown }> => {
    let res: Response;
    try {
      res = await fetcher(`${base}${path}`, { method, headers: body ? { ...headers, 'Content-Type': 'application/json' } : headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    } catch {
      throw new SyncError('Geen verbinding met GitHub. Probeer het later opnieuw.');
    }
    if (res.status === 401) throw new SyncError('De sleutel is ongeldig of verlopen. Maak een nieuwe en koppel opnieuw.');
    if (res.status === 403 && method === 'GET') throw new SyncError('De sleutel mag deze repo niet lezen (of GitHub weigert tijdelijk). Controleer de rechten van de sleutel.');
    const json = res.status === 204 ? null : await res.json().catch(() => null);
    return { status: res.status, json };
  };
  const enc = (p: string) => p.split('/').map(encodeURIComponent).join('/');
  return {
    async repoInfo(): Promise<{ private: boolean }> {
      const r = await call('GET', '');
      if (r.status === 404) throw new SyncError(`Repo "${cfg.repo}" niet gevonden, of de sleutel heeft er geen toegang toe.`);
      if (r.status !== 200) throw new SyncError(`GitHub gaf fout ${r.status}.`);
      return { private: (r.json as { private?: boolean }).private === true };
    },
    async getFile(path: string): Promise<{ sha: string; text: string } | null> {
      const r = await call('GET', `/contents/${enc(path)}`);
      if (r.status === 404) return null;
      if (r.status !== 200) throw new SyncError(`Lezen van ${path} mislukte (fout ${r.status}).`);
      const f = r.json as { sha: string; content?: string; encoding?: string };
      if (f.content && f.encoding === 'base64') return { sha: f.sha, text: fromBase64(f.content) };
      // Groter dan 1 MB: inhoud via de blob ophalen.
      const b = await call('GET', `/git/blobs/${f.sha}`);
      if (b.status !== 200) throw new SyncError(`Lezen van ${path} mislukte (fout ${b.status}).`);
      return { sha: f.sha, text: fromBase64((b.json as { content: string }).content) };
    },
    /** Geeft de nieuwe sha terug (of '' als GitHub die niet meestuurt), of 'conflict'. */
    async putFile(path: string, text: string, sha: string | undefined, message: string): Promise<{ sha: string } | 'conflict'> {
      const r = await call('PUT', `/contents/${enc(path)}`, { message, content: toBase64(text), ...(sha ? { sha } : {}) });
      if (r.status === 200 || r.status === 201) return { sha: (r.json as { content?: { sha?: string } } | null)?.content?.sha ?? '' };
      if (r.status === 409 || r.status === 422) return 'conflict';
      if (r.status === 403 || r.status === 404) throw new SyncError('De sleutel mag niet schrijven in deze repo. Geef hem "Contents: Read and write".');
      throw new SyncError(`Opslaan in GitHub mislukte (fout ${r.status}).`);
    },
    async listDir(path: string): Promise<{ name: string; path: string; sha: string; type: string }[]> {
      const r = await call('GET', `/contents/${enc(path)}`);
      if (r.status === 404) return [];
      if (r.status !== 200 || !Array.isArray(r.json)) throw new SyncError(`Map ${path} lezen mislukte (fout ${r.status}).`);
      return r.json as { name: string; path: string; sha: string; type: string }[];
    },
    async deleteFile(path: string, sha: string, message: string): Promise<void> {
      const r = await call('DELETE', `/contents/${enc(path)}`, { message, sha });
      if (r.status !== 200 && r.status !== 404) throw new SyncError(`Verwijderen van ${path} mislukte (fout ${r.status}).`);
    },
  };
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function fromBase64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ---------- Koppelen en synchroniseren ----------

const REPO_RE = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

/** Controleert sleutel en repo (moet privé zijn) en slaat ze op. Synchroniseert daarna niet zelf. */
export async function connect(repo: string, token: string): Promise<void> {
  const cfg = { repo: repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, ''), token: token.trim() };
  if (!REPO_RE.test(cfg.repo)) throw new SyncError('Vul de repo in als eigenaar/naam, bijv. tomasr91/bijdehand-data.');
  if (cfg.token.length < 20) throw new SyncError('Dit lijkt geen GitHub-sleutel. Plak de hele sleutel (begint meestal met github_pat_).');
  const info = await api(cfg).repoInfo();
  if (!info.private) throw new SyncError('Deze repo is openbaar. Je gegevens horen alleen in een privé-repo; zet hem eerst op privé.');
  const prev = await meta(K.repo);
  await setMeta(K.repo, cfg.repo);
  await setMeta(K.token, cfg.token);
  await setMeta(K.error, null);
  // Andere repo dan eerst: opnieuw beginnen alsof het de eerste keer is (eerst samenvoegen).
  if (prev && prev !== cfg.repo) await setMeta(K.lastAt, null);
}

/** Goedkope vingerafdruk van de gegevens: verandert bij elke wijziging. */
export async function fingerprint(): Promise<string> {
  const [ni, ns, nl, li, ls] = await Promise.all([
    db.items.count(), db.sources.count(), db.links.count(),
    db.items.orderBy('updatedAt').last(), db.sources.orderBy('updatedAt').last(),
  ]);
  const links = await db.links.toArray();
  const lmax = links.reduce((m, l) => (l.updatedAt > m ? l.updatedAt : m), '');
  return [ni, ns, nl, li?.updatedAt ?? '', ls?.updatedAt ?? '', lmax].join('|');
}

/** Moet er iets naar GitHub? (gewijzigd sinds de laatste keer, of nog nooit gesynchroniseerd) */
export async function needsPush(): Promise<boolean> {
  const [cfg, last, now] = await Promise.all([getSyncConfig(), meta(K.lastPrint), fingerprint()]);
  return !!cfg && last !== now;
}

let running: Promise<SyncResult> | null = null;

/**
 * Eén synchronisatieronde. Gelijktijdige aanroepen wachten op dezelfde ronde, en via een Web Lock ook over tabbladen heen:
 * staat de app op twee plekken open (tabblad + geïnstalleerde app), dan synchroniseert er maar één tegelijk.
 * Zonder die vergrendeling pasten twee tabbladen hetzelfde voorstel tegelijk toe en ontstonden dubbele items.
 */
export function syncNow(): Promise<SyncResult> {
  if (!running) running = withLock('bijdehand-sync', runSync).finally(() => { running = null; });
  return running;
}

async function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  return locks?.request ? (locks.request(name, fn) as Promise<T>) : fn();
}

/** Voorstelbestanden die al zijn toegepast (naam@sha), zodat een bestand nooit twee keer wordt verwerkt. */
async function appliedFiles(): Promise<string[]> {
  try { return JSON.parse((await meta(K.applied)) ?? '[]') as string[]; } catch { return []; }
}
async function rememberApplied(id: string): Promise<void> {
  const list = (await appliedFiles()).filter((x) => x !== id);
  list.push(id);
  await setMeta(K.applied, JSON.stringify(list.slice(-200)));
}

async function runSync(): Promise<SyncResult> {
  const cfg = await getSyncConfig();
  if (!cfg) throw new SyncError('Nog niet gekoppeld.');
  const gh = api(cfg);
  const result: SyncResult = { merged: null, pushed: false, applied: { updated: 0, created: 0, trashed: 0, titles: [] }, undo: [], skippedFiles: [] };
  try {
    // 1. Repo veranderd sinds dit toestel hem laatst zag (eerste keer of een andere kopie schreef ertussen):
    //    eerst samenvoegen (niets verwijderen, nieuwste wint). Nooit blind overschrijven (D31).
    let remote = await gh.getFile(DATA_PATH);
    const mergeRemote = async (r: { sha: string; text: string }) => {
      const parsed = parseBackup(r.text);
      if (!parsed.ok) throw new SyncError(`${DATA_PATH} in de repo is geen geldige back-up: ${parsed.error}`);
      const plan = await applyRestore(parsed.backup, 'merge');
      const n = { items: plan.added.items + plan.updated.items, sources: plan.added.sources + plan.updated.sources };
      result.merged = result.merged ? { items: result.merged.items + n.items, sources: result.merged.sources + n.sources } : n;
    };
    if (remote && (!(await meta(K.lastAt)) || remote.sha !== (await meta(K.lastSha)))) await mergeRemote(remote);

    // 2. Voorstellen van Claude toepassen (vóór het opslaan, zodat de repo meteen de nieuwe stand krijgt).
    const files = (await gh.listDir(PROPOSALS_DIR)).filter((f) => f.type === 'file' && f.name.endsWith('.json')).sort((a, b) => a.name.localeCompare(b.name));
    for (const f of files) {
      const done = `${f.name}@${f.sha}`;
      if ((await appliedFiles()).includes(done)) {
        // Al eerder toegepast (bijv. het verwijderen mislukte toen): alleen opruimen.
        await gh.deleteFile(f.path, f.sha, `Al verwerkt door de app: ${f.name}`).catch(() => {});
        continue;
      }
      const file = await gh.getFile(f.path);
      if (!file) continue;
      const items = await db.items.toArray();
      const parsed = parseProposals(file.text, items);
      if (!parsed.ok) { result.skippedFiles.push(f.name); continue; }
      // Geschreven voor een nieuwere versie van de app (onbekend veld of actie)? Laten staan tot de app is bijgewerkt.
      if (parsed.value.rows.some((r) => r.status === 'fout' && /onbekend veld|onbekende actie|onbekende soort/.test(r.problem ?? ''))) { result.skippedFiles.push(f.name); continue; }
      const ok = parsed.value.rows.filter((r) => r.status === 'ok');
      if (ok.length) {
        const res = await applyProposals(ok, parsed.value.rows);
        result.applied.updated += res.updated;
        result.applied.created += res.created;
        result.applied.trashed += res.trashed;
        result.undo.push(res.undo);
        for (const r of ok) if (r.p.actie !== 'laten') result.applied.titles.push(r.p.titel || r.item?.title || '');
      }
      await rememberApplied(done);
      await gh.deleteFile(f.path, file.sha, `Verwerkt door de app: ${f.name}`);
    }

    // 3. Volledige stand opslaan. Schreef een andere kopie er net tussendoor: die stand eerst samenvoegen en opnieuw.
    const print = await fingerprint();
    if (!remote || remote.sha !== (await meta(K.lastSha)) || print !== (await meta(K.lastPrint)) || result.merged || result.undo.length) {
      let saved: { sha: string } | 'conflict' = 'conflict';
      for (let attempt = 0; attempt < 3 && saved === 'conflict'; attempt++) {
        if (attempt > 0) {
          remote = await gh.getFile(DATA_PATH);
          if (remote) await mergeRemote(remote);
        }
        const text = JSON.stringify(await exportBackup(), null, 1);
        saved = await gh.putFile(DATA_PATH, text, remote?.sha, `Bijdehand: stand van ${nowIso()}`);
      }
      if (saved === 'conflict') throw new SyncError('De repo veranderde tijdens het opslaan. Probeer het zo opnieuw.');
      const sha = saved.sha || (await gh.getFile(DATA_PATH))?.sha || '';
      await setMeta(K.lastSha, sha);
      result.pushed = true;
    } else if (remote) {
      await setMeta(K.lastSha, remote.sha);
    }
    await setMeta(K.lastPrint, await fingerprint());
    await setMeta(K.lastAt, nowIso());
    await setMeta(K.error, null);
    return result;
  } catch (e) {
    const msg = e instanceof SyncError ? e.message : 'Synchroniseren mislukte door een onverwachte fout.';
    if (!(e instanceof SyncError)) console.error(e);
    await setMeta(K.error, msg);
    throw e instanceof SyncError ? e : new SyncError(msg);
  }
}
