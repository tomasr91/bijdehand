import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { exportBackup } from './backup';
import { db, switchDb } from './db';
import * as repo from './repo';
import { connect, DATA_PATH, disconnect, getSyncStatus, needsPush, setFetcher, syncNow } from './sync';

/** Nagebootste GitHub-repo: bestanden in het geheugen, met sha's zoals de echte Contents API. */
function fakeGitHub(opts: { private?: boolean; token?: string } = {}) {
  const files = new Map<string, { sha: string; text: string }>();
  let n = 0;
  const calls: string[] = [];
  const b64 = (t: string) => btoa(String.fromCharCode(...new TextEncoder().encode(t)));
  const un64 = (t: string) => new TextDecoder().decode(Uint8Array.from(atob(t), (c) => c.charCodeAt(0)));
  const json = (status: number, body: unknown) => new Response(body === null ? null : JSON.stringify(body), { status });
  const f: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url.pathname}`);
    const auth = (init?.headers as Record<string, string>)?.Authorization;
    if (auth !== `Bearer ${opts.token ?? 'github_pat_test_0123456789abcdef'}`) return json(401, { message: 'Bad credentials' });
    const m = url.pathname.match(/^\/repos\/[^/]+\/[^/]+(\/contents\/(.*))?$/);
    if (!m) return json(404, null);
    if (!m[1]) return json(200, { private: opts.private ?? true });
    const path = decodeURIComponent(m[2]);
    if (method === 'GET') {
      const file = files.get(path);
      if (file) return json(200, { sha: file.sha, content: b64(file.text), encoding: 'base64' });
      const dir = [...files.entries()].filter(([p]) => p.startsWith(path + '/'));
      if (dir.length) return json(200, dir.map(([p, v]) => ({ name: p.split('/').pop(), path: p, sha: v.sha, type: 'file' })));
      return json(404, { message: 'Not Found' });
    }
    const body = JSON.parse(String(init?.body));
    const cur = files.get(path);
    if (method === 'PUT') {
      if ((cur && body.sha !== cur.sha) || (!cur && body.sha)) return json(409, { message: 'sha mismatch' });
      files.set(path, { sha: `s${++n}`, text: un64(body.content) });
      return json(cur ? 200 : 201, {});
    }
    if (method === 'DELETE') {
      if (!cur || body.sha !== cur.sha) return json(409, {});
      files.delete(path);
      return json(200, {});
    }
    return json(405, null);
  };
  return { files, calls, fetch: f, put: (p: string, text: string) => files.set(p, { sha: `s${++n}`, text }) };
}

const TOKEN = 'github_pat_test_0123456789abcdef';
let k = 0;
beforeEach(() => {
  switchDb(`sync-${++k}`);
});

describe('koppelen', () => {
  it('weigert een openbare repo, een ongeldige naam en een verkeerde sleutel', async () => {
    setFetcher(fakeGitHub({ private: false }).fetch);
    await expect(connect('tomas/data', TOKEN)).rejects.toThrow(/openbaar/);
    await expect(connect('geen repo', TOKEN)).rejects.toThrow(/eigenaar\/naam/);
    setFetcher(fakeGitHub().fetch);
    await expect(connect('tomas/data', 'github_pat_verkeerd_000000000000')).rejects.toThrow(/ongeldig of verlopen/);
    expect((await getSyncStatus()).connected).toBe(false);
    await connect('https://github.com/tomas/data', TOKEN);
    expect(await getSyncStatus()).toMatchObject({ connected: true, repo: 'tomas/data' });
  });

  it('de sleutel gaat nooit mee in de back-up', async () => {
    setFetcher(fakeGitHub().fetch);
    await connect('tomas/data', TOKEN);
    expect(JSON.stringify(await exportBackup())).not.toContain(TOKEN);
  });
});

describe('synchroniseren', () => {
  it('eerste keer: voegt de repo samen met het toestel en slaat daarna alles op', async () => {
    // Een eerder toestel zette al een restaurant in de repo.
    const gh = fakeGitHub();
    setFetcher(gh.fetch);
    const old = await repo.createItem({ type: 'restaurant', title: 'Pamir', fields: { city: 'Leiden' } });
    gh.put(DATA_PATH, JSON.stringify(await exportBackup()));
    switchDb(`sync-${++k}`); // nieuw toestel, met al één eigen item
    await repo.createItem({ type: 'album', title: 'Klara and the Sun' });
    await connect('tomas/data', TOKEN);
    const r = await syncNow();
    expect(r.merged?.items).toBe(1);
    expect(r.pushed).toBe(true);
    expect((await db.items.get(old.id))?.title).toBe('Pamir');
    const stored = JSON.parse(gh.files.get(DATA_PATH)!.text);
    expect(stored.data.items.map((i: { title: string }) => i.title).sort()).toEqual(['Klara and the Sun', 'Pamir']);
    // Niets veranderd: geen nieuwe opslag nodig.
    expect(await needsPush()).toBe(false);
    const r2 = await syncNow();
    expect(r2.pushed).toBe(false);
    // Wijziging: wel opslaan.
    await repo.createItem({ type: null, title: 'Groen Leiden' });
    expect(await needsPush()).toBe(true);
    expect((await syncNow()).pushed).toBe(true);
    expect(JSON.parse(gh.files.get(DATA_PATH)!.text).data.items).toHaveLength(3);
  });

  it('twee kopieën van de app overschrijven elkaar niet: een oudere stand wordt eerst samengevoegd (bug 2026-10-28)', async () => {
    const gh = fakeGitHub();
    setFetcher(gh.fetch);
    // Kopie A (bijv. Chrome) en kopie B (bijv. Firefox) zijn allebei gekoppeld en gesynchroniseerd.
    const dbA = `sync-${++k}`, dbB = `sync-${++k}`;
    switchDb(dbA); await connect('tomas/data', TOKEN); await syncNow();
    switchDb(dbB); await connect('tomas/data', TOKEN); await syncNow();
    // B krijgt nieuwe items (zoals Claude's voorstellen) en slaat op.
    const kleding = await repo.createItem({ type: 'clothing', title: 'Bergvos', fields: { sizes: ['trui M'] } });
    expect((await syncNow()).pushed).toBe(true);
    // A heeft de oude stand, voegt zelf iets toe en synchroniseert: B's item mag niet verdwijnen.
    switchDb(dbA);
    await repo.createItem({ type: null, title: '', body: 'Grand Living Utrecht' });
    const r = await syncNow();
    expect(r.merged?.items).toBe(1);
    const stored = JSON.parse(gh.files.get(DATA_PATH)!.text);
    expect(stored.data.items.map((i: { id: string }) => i.id)).toContain(kleding.id);
    expect(stored.data.items).toHaveLength(2);
    // En B krijgt A's item er bij de volgende keer bij.
    switchDb(dbB);
    await syncNow();
    expect(await db.items.count()).toBe(2);
  });

  it('past voorstellen van Claude automatisch toe, verwijdert het bestand en kan alles terugdraaien', async () => {
    const gh = fakeGitHub();
    setFetcher(gh.fetch);
    const note = await repo.createItem({ type: null, title: 'Pamir Leiden', body: 'aanrader' });
    const fresh = await repo.createItem({ type: null, title: 'Iets' });
    await connect('tomas/data', TOKEN);
    await syncNow();
    const exportedAt = JSON.parse(gh.files.get(DATA_PATH)!.text).exportedAt;
    await repo.updateItem(fresh.id, { body: 'na het delen gewijzigd' });
    gh.put('voorstellen/2026-10-25.json', JSON.stringify({
      format: 'bijdehand-voorstellen', formatVersion: 1, gebaseerdOp: exportedAt, voorstellen: [
        { id: 'v1', actie: 'indelen', itemId: note.id, type: 'restaurant', titel: 'Pamir', velden: { city: 'Leiden', cuisine: 'Afghaans', traits: ['afghaans'], website: 'https://pamir.example/' } },
        { id: 'v2', actie: 'indelen', itemId: fresh.id, type: 'album' },
      ],
    }));
    gh.put('voorstellen/kapot.json', '{ geen json');
    const r = await syncNow();
    expect(r.applied).toMatchObject({ updated: 1, titles: ['Pamir'] });
    expect(r.skippedFiles).toEqual(['kapot.json']);
    expect(gh.files.has('voorstellen/2026-10-25.json')).toBe(false); // verwerkt
    expect(gh.files.has('voorstellen/kapot.json')).toBe(true); // blijft staan
    expect((await db.items.get(note.id))).toMatchObject({ type: 'restaurant', title: 'Pamir', fields: { cuisine: 'Afghaans', website: 'https://pamir.example/' } });
    expect((await db.items.get(fresh.id))?.type).toBeNull(); // na het delen gewijzigd: niet automatisch
    // De repo kreeg meteen de nieuwe stand.
    expect(JSON.parse(gh.files.get(DATA_PATH)!.text).data.items.find((i: { id: string }) => i.id === note.id).type).toBe('restaurant');
    const { undoApply } = await import('./claude');
    for (const u of r.undo) await undoApply(u);
    expect((await db.items.get(note.id))?.type).toBeNull();
  });

  it('past een voorstelbestand nooit twee keer toe, ook niet als het verwijderen in GitHub mislukte', async () => {
    const gh = fakeGitHub();
    let failDelete = true;
    setFetcher(async (input, init) => {
      if ((init?.method ?? 'GET') === 'DELETE' && failDelete) { failDelete = false; return new Response('{}', { status: 409 }); }
      return gh.fetch(input, init);
    });
    await connect('tomas/data', TOKEN);
    await syncNow();
    gh.put('voorstellen/a.json', JSON.stringify({ format: 'bijdehand-voorstellen', formatVersion: 1, voorstellen: [{ actie: 'nieuw', type: 'album', titel: 'Klara and the Sun' }] }));
    await expect(syncNow()).rejects.toThrow(); // verwijderen mislukt → ronde mislukt, maar het bestand is al toegepast
    await syncNow(); // tweede ronde: bestand overslaan en opruimen
    const books = (await db.items.toArray()).filter((i) => i.type === 'album');
    expect(books).toHaveLength(1);
    expect(gh.files.has('voorstellen/a.json')).toBe(false);
  });

  it('laat een voorstel voor een nieuwere app-versie (onbekend veld) staan in plaats van het weg te gooien', async () => {
    const gh = fakeGitHub();
    setFetcher(gh.fetch);
    await connect('tomas/data', TOKEN);
    await syncNow();
    gh.put('voorstellen/nieuw.json', JSON.stringify({ format: 'bijdehand-voorstellen', formatVersion: 1, voorstellen: [{ actie: 'nieuw', type: 'album', titel: 'X', velden: { veldUitDeToekomst: 1 } }] }));
    const r = await syncNow();
    expect(r.skippedFiles).toEqual(['nieuw.json']);
    expect(gh.files.has('voorstellen/nieuw.json')).toBe(true);
    expect((await db.items.toArray()).filter((i) => i.type === 'album')).toHaveLength(0);
  });

  it('meldt een fout en onthoudt die in de status; ontkoppelen laat de gegevens staan', async () => {
    const gh = fakeGitHub();
    setFetcher(gh.fetch);
    await connect('tomas/data', TOKEN);
    await repo.createItem({ type: 'album', title: 'Album' });
    setFetcher(async () => { throw new TypeError('offline'); });
    await expect(syncNow()).rejects.toThrow(/Geen verbinding/);
    expect((await getSyncStatus()).error).toMatch(/Geen verbinding/);
    setFetcher(gh.fetch);
    await syncNow();
    expect((await getSyncStatus()).error).toBeNull();
    await disconnect();
    expect((await getSyncStatus()).connected).toBe(false);
    expect(await db.items.count()).toBe(1);
    expect(gh.files.has(DATA_PATH)).toBe(true);
  });
});
