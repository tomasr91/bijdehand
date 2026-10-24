// Export en herstel. Formaat beschreven in docs/DATA_MODEL.md → Back-upformaat.
// Herstellen schrijft pas na validatie, in één transactie: alles of niets.
import { db } from './db';
import { isTypeKey } from './itemTypes';
import { migrateItem } from './migrate';
import { SCHEMA_VERSION, type Item, type Link, type Revision, type Source } from './model';
import { normalizeUrl, nowIso, siteOf } from './util';

export const BACKUP_FORMAT = 'bijdehand-backup';
export const BACKUP_FORMAT_VERSION = 1;
/** Versie van de app die de back-up maakte (informatief; ophogen bij een functie die nieuwe velden of acties kent). */
export const APP_VERSION = '2026-10-24.5-soort-zaak';

export interface Backup {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  schemaVersion: number;
  exportedAt: string;
  /** Welke app-versie de back-up maakte (optioneel; oudere back-ups hebben dit niet). */
  appVersion?: string;
  counts: { items: number; sources: number; links: number; revisions: number };
  data: { items: Item[]; sources: Source[]; links: Link[]; revisions: Revision[] };
}

export async function exportBackup(): Promise<Backup> {
  return db.transaction('r', db.items, db.sources, db.links, db.revisions, async () => {
    const [items, sources, links, revisions] = await Promise.all([
      db.items.toArray(), db.sources.toArray(), db.links.toArray(), db.revisions.toArray(),
    ]);
    return {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: nowIso(),
      appVersion: APP_VERSION,
      counts: { items: items.length, sources: sources.length, links: links.length, revisions: revisions.length },
      data: { items, sources, links, revisions },
    };
  });
}

export function backupFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `bijdehand-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

// ---------- Validatie ----------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

function cleanFields(f: Record<string, unknown>): Item['fields'] {
  const out: Item['fields'] = {};
  for (const [k, v] of Object.entries(f)) {
    if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) out[k] = v as string | number | boolean | null;
    else if (Array.isArray(v)) out[k] = v.filter(isStr);
  }
  return out;
}

function normItem(r: unknown, i: number): Item {
  if (!isObj(r) || !isStr(r.id) || !isStr(r.createdAt) || !isStr(r.updatedAt)) throw new Error(`Item ${i + 1}: id of datums ontbreken`);
  if (r.type !== null && r.type !== undefined && !isTypeKey(r.type)) throw new Error(`Item ${i + 1}: onbekende soort "${String(r.type)}" (back-up van een nieuwere versie?)`);
  return {
    id: r.id,
    type: (r.type as Item['type']) ?? null,
    title: isStr(r.title) ? r.title : '',
    body: isStr(r.body) ? r.body : '',
    fields: isObj(r.fields) ? cleanFields(r.fields) : {},
    checklist: Array.isArray(r.checklist) ? (r.checklist as Item['checklist']).filter((e) => isObj(e) && isStr(e.id) && isStr(e.text)).map((e) => ({ id: e.id, text: e.text, done: !!e.done })) : [],
    tags: Array.isArray(r.tags) ? (r.tags as unknown[]).filter(isStr) : [],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: isStr(r.deletedAt) ? r.deletedAt : null,
    rev: typeof r.rev === 'number' ? r.rev : 1,
    origin: isObj(r.origin) ? (r.origin as unknown as Item['origin']) : null,
    suggestion: isObj(r.suggestion) && isTypeKey(r.suggestion.type) ? (r.suggestion as unknown as Item['suggestion']) : null,
    ...(isObj(r.filledBy) && isStr(r.filledBy.at) && Array.isArray(r.filledBy.fields)
      ? { filledBy: { by: 'claude' as const, at: r.filledBy.at, fields: (r.filledBy.fields as unknown[]).filter(isStr) } }
      : {}),
    schemaVersion: typeof r.schemaVersion === 'number' ? r.schemaVersion : 1,
  };
}

function normSource(r: unknown, i: number): Source {
  if (!isObj(r) || !isStr(r.id) || !isStr(r.url) || !isStr(r.createdAt) || !isStr(r.updatedAt)) throw new Error(`Bron ${i + 1}: id, url of datums ontbreken`);
  const via = ['handmatig', 'deelmenu', 'import', 'voorbeeld', 'opgezocht'].includes(r.infoVia as string) ? (r.infoVia as Source['infoVia']) : 'handmatig';
  return {
    id: r.id,
    url: r.url,
    normalizedUrl: normalizeUrl(r.url),
    title: isStr(r.title) ? r.title : '',
    site: isStr(r.site) && r.site ? r.site : siteOf(r.url),
    description: isStr(r.description) ? r.description : '',
    imageUrl: isStr(r.imageUrl) ? r.imageUrl : '',
    infoVia: via,
    note: isStr(r.note) ? r.note : '',
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: isStr(r.deletedAt) ? r.deletedAt : null,
    rev: typeof r.rev === 'number' ? r.rev : 1,
    origin: isObj(r.origin) ? (r.origin as unknown as Source['origin']) : null,
    schemaVersion: typeof r.schemaVersion === 'number' ? r.schemaVersion : SCHEMA_VERSION,
  };
}

function normLink(r: unknown, i: number): Link {
  if (!isObj(r) || !isStr(r.id) || !isStr(r.aId) || !isStr(r.bId)) throw new Error(`Koppeling ${i + 1}: onvolledig`);
  const kind = (k: unknown) => (k === 'source' ? 'source' : 'item');
  const created = isStr(r.createdAt) ? r.createdAt : nowIso();
  return { id: r.id, aKind: kind(r.aKind), aId: r.aId, bKind: kind(r.bKind), bId: r.bId, createdAt: created, updatedAt: isStr(r.updatedAt) ? r.updatedAt : created, deletedAt: isStr(r.deletedAt) ? r.deletedAt : null };
}

function normRevision(r: unknown, i: number): Revision {
  if (!isObj(r) || !isStr(r.id) || !isStr(r.entityId) || !isObj(r.snapshot) || !isStr(r.changedAt)) throw new Error(`Revisie ${i + 1}: onvolledig`);
  return { id: r.id, kind: r.kind === 'source' ? 'source' : 'item', entityId: r.entityId, rev: typeof r.rev === 'number' ? r.rev : 0, snapshot: r.snapshot as unknown as Item, changedAt: r.changedAt };
}

export type ParseResult = { ok: true; backup: Backup } | { ok: false; error: string };

export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Dit bestand is geen geldige JSON.' };
  }
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT) return { ok: false, error: 'Dit is geen Bijdehand-back-up.' };
  if (typeof raw.formatVersion !== 'number' || raw.formatVersion > BACKUP_FORMAT_VERSION) {
    return { ok: false, error: 'Deze back-up komt uit een nieuwere versie van de app. Werk de app eerst bij.' };
  }
  const d = raw.data;
  if (!isObj(d) || !Array.isArray(d.items) || !Array.isArray(d.sources) || !Array.isArray(d.links)) {
    return { ok: false, error: 'De back-up mist gegevens (items, bronnen of koppelingen).' };
  }
  try {
    const items = d.items.map(normItem).map(migrateItem);
    const sources = d.sources.map(normSource);
    const links = d.links.map(normLink);
    const revisions = Array.isArray(d.revisions) ? d.revisions.map(normRevision) : [];
    const ids = new Set<string>();
    for (const r of [...items, ...sources]) {
      if (ids.has(r.id)) throw new Error(`Dubbele id ${r.id}`);
      ids.add(r.id);
    }
    return {
      ok: true,
      backup: {
        format: BACKUP_FORMAT,
        formatVersion: raw.formatVersion,
        schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : SCHEMA_VERSION,
        exportedAt: isStr(raw.exportedAt) ? raw.exportedAt : '',
        counts: { items: items.length, sources: sources.length, links: links.length, revisions: revisions.length },
        data: { items, sources, links, revisions },
      },
    };
  } catch (e) {
    return { ok: false, error: `De back-up is beschadigd: ${(e as Error).message}` };
  }
}

// ---------- Herstellen ----------

export type RestoreMode = 'merge' | 'replace';

export interface RestorePlan {
  mode: RestoreMode;
  /** Nieuw toe te voegen records. */
  added: { items: number; sources: number; links: number };
  /** Records die in de back-up nieuwer zijn en lokaal worden bijgewerkt. */
  updated: { items: number; sources: number };
  /** Records die lokaal gelijk of nieuwer zijn en dus blijven zoals ze zijn. */
  kept: { items: number; sources: number };
  /** Bronnen met dezelfde link als een bestaande bron: samengevoegd. */
  mergedSources: number;
  /** Bij vervangen: aantal lokale records dat verdwijnt. */
  removed: { items: number; sources: number };
}

interface Prepared {
  plan: RestorePlan;
  items: Item[];
  sources: Source[];
  links: Link[];
  revisions: Revision[];
}

async function prepare(backup: Backup, mode: RestoreMode): Promise<Prepared> {
  const [localItems, localSources, localLinks, localRevs] = await Promise.all([
    db.items.toArray(), db.sources.toArray(), db.links.toArray(), db.revisions.toArray(),
  ]);
  const plan: RestorePlan = {
    mode,
    added: { items: 0, sources: 0, links: 0 },
    updated: { items: 0, sources: 0 },
    kept: { items: 0, sources: 0 },
    mergedSources: 0,
    removed: { items: 0, sources: 0 },
  };
  const { data } = backup;
  if (mode === 'replace') {
    plan.added = { items: data.items.length, sources: data.sources.length, links: data.links.length };
    plan.removed = { items: localItems.length, sources: localSources.length };
    return { plan, ...data };
  }

  const li = new Map(localItems.map((x) => [x.id, x]));
  const items: Item[] = [];
  for (const it of data.items) {
    const cur = li.get(it.id);
    if (!cur) { items.push(it); plan.added.items++; } else if (it.updatedAt > cur.updatedAt) { items.push(it); plan.updated.items++; } else plan.kept.items++;
  }

  const ls = new Map(localSources.map((x) => [x.id, x]));
  const byUrl = new Map(localSources.filter((s) => !s.deletedAt).map((s) => [s.normalizedUrl, s.id]));
  const remap = new Map<string, string>();
  const sources: Source[] = [];
  for (const s of data.sources) {
    const cur = ls.get(s.id);
    if (cur) {
      if (s.updatedAt > cur.updatedAt) { sources.push(s); plan.updated.sources++; } else plan.kept.sources++;
      continue;
    }
    const dup = !s.deletedAt ? byUrl.get(s.normalizedUrl) : undefined;
    if (dup) { remap.set(s.id, dup); plan.mergedSources++; continue; }
    sources.push(s);
    plan.added.sources++;
  }

  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const livePairs = new Set(localLinks.filter((l) => !l.deletedAt).map((l) => pairKey(l.aId, l.bId)));
  const linkById = new Map(localLinks.map((l) => [l.id, l]));
  const links: Link[] = [];
  for (const raw of data.links) {
    const l = { ...raw, aId: remap.get(raw.aId) ?? raw.aId, bId: remap.get(raw.bId) ?? raw.bId };
    const key = pairKey(l.aId, l.bId);
    const local = linkById.get(l.id);
    if (local) {
      if (l.updatedAt > local.updatedAt) links.push(l);
      continue;
    }
    if (l.aId === l.bId || (livePairs.has(key) && !l.deletedAt)) continue;
    links.push(l);
    livePairs.add(key);
    plan.added.links++;
  }

  const revIds = new Set(localRevs.map((r) => r.id));
  const revisions = data.revisions.filter((r) => !revIds.has(r.id));
  return { plan, items, sources, links, revisions };
}

export async function planRestore(backup: Backup, mode: RestoreMode): Promise<RestorePlan> {
  return (await prepare(backup, mode)).plan;
}

export async function applyRestore(backup: Backup, mode: RestoreMode): Promise<RestorePlan> {
  return db.transaction('rw', db.items, db.sources, db.links, db.revisions, async () => {
    const p = await prepare(backup, mode);
    if (mode === 'replace') {
      await Promise.all([db.items.clear(), db.sources.clear(), db.links.clear(), db.revisions.clear()]);
    }
    await db.items.bulkPut(p.items);
    await db.sources.bulkPut(p.sources);
    await db.links.bulkPut(p.links);
    await db.revisions.bulkPut(p.revisions);
    return p.plan;
  });
}
