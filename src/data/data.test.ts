import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyRestore, exportBackup, parseBackup, planRestore } from './backup';
import { suggestType } from './classify';
import { db, switchDb } from './db';
import * as repo from './repo';
import { search } from './search';
import { loadSampleData } from './testdata';
import { addDays, daysBetween, findUrl, isUrl, normalizeUrl, relativeDay } from './util';

let n = 0;
beforeEach(async () => {
  switchDb(`test-${++n}`);
  await db.open();
});

async function snapshot() {
  return { items: await db.items.toArray(), sources: await db.sources.toArray(), links: await db.links.toArray() };
}
async function all() {
  return snapshot();
}

describe('util', () => {
  it('herkent en normaliseert links', () => {
    expect(findUrl('kijk https://www.Example.com/a?utm_source=x&b=2#top ok')).toBe('https://www.Example.com/a?utm_source=x&b=2#top');
    expect(normalizeUrl('https://www.Example.com/a/?utm_source=x&b=2#top')).toBe('example.com/a?b=2');
    expect(normalizeUrl('http://example.com/a')).toBe(normalizeUrl('https://www.example.com/a/'));
    expect(isUrl('example.com/pagina')).toBe(true);
    expect(isUrl('gewoon een zin')).toBe(false);
  });
  it('rekent met datums', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
    expect(addDays('2026-10-24', 7)).toBe('2026-10-31');
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(relativeDay('2026-10-23', '2026-10-24')).toBe('gisteren');
    expect(relativeDay('2026-10-20', '2026-10-24')).toBe('4 dagen te laat');
  });
});

describe('classificatie (regels)', () => {
  it('stelt soorten voor op basis van woorden en websites', () => {
    expect(suggestType('Nieuw restaurant in Utrecht proberen')?.type).toBe('restaurant');
    expect(suggestType('nieuw album van Radiohead', 'https://open.spotify.com/album/x')?.type).toBe('album');
    expect(suggestType('cadeau voor mama')).toBeNull(); // verwijderde soort
    expect(suggestType('paklijst skivakantie', null, 3)?.type).toBe('packing');
    expect(suggestType('iets willekeurigs')).toBeNull();
  });
});

describe('repository', () => {
  it('maakt, wijzigt, verwijdert en herstelt met historie', async () => {
    const item = await repo.createItem({ type: 'album', title: 'Blue', fields: { artist: 'Joni', status: 'ontdekken' } });
    await repo.setField(item.id, 'artist', 'Joni Mitchell');
    const cur = await db.items.get(item.id);
    expect(cur?.fields.artist).toBe('Joni Mitchell');
    expect(cur?.rev).toBe(2);
    const revs = await db.revisions.where('entityId').equals(item.id).toArray();
    expect(revs).toHaveLength(1);
    expect((revs[0].snapshot as typeof cur)!.fields.artist).toBe('Joni');
    await repo.deleteItem(item.id);
    expect((await db.items.get(item.id))?.deletedAt).toBeTruthy();
    await repo.restoreItem(item.id);
    expect((await db.items.get(item.id))?.deletedAt).toBeNull();
    await repo.restoreRevision(revs[0].id);
    expect((await db.items.get(item.id))?.fields.artist).toBe('Joni');
  });

  it('bewaart een link één keer (duplicaat herkend) en koppelt hem', async () => {
    const a = await repo.capture({ type: null, title: '', url: 'https://www.example.com/x?utm_source=a' });
    const b = await repo.capture({ type: 'restaurant', title: 'Zelfde plek', url: 'https://example.com/x' });
    expect(b.sourceExisted).toBe(true);
    expect(b.source?.id).toBe(a.source?.id);
    expect(a.item.title).toBe('example.com');
    expect(await db.sources.count()).toBe(1);
    expect(await db.links.count()).toBe(2);
  });
});

describe('zoeken', () => {
  it('beantwoordt voorbeeldvragen met tekst en filters', async () => {
    await loadSampleData();
    const data = await all();
    const titles = (q: string) => search(data, q).hits.map((h) => (h.kind === 'item' ? h.item.title : h.source.title));
    expect(titles('Welke restaurants wilde ik nog proberen?').sort()).toEqual(['Bar Basiliek', 'Het Groene Bord']);
    expect(titles('Welke albums wil ik nog ontdekken?')).toEqual(['In Rainbows']);
    expect(titles('radiohead')).toEqual(['In Rainbows']);
    expect(titles('gent')).toContain('Eetcafé De Graslei');
    expect(titles('maand')).toContain('Het Groene Bord'); // notitie bij de gekoppelde link
    expect(titles('tiramisu')).toEqual(['Trattoria Da Marco']);
    expect(search(data, '', { type: 'inbox' }).hits).toHaveLength(2);
    expect(search(data, '', { type: 'album', status: 'geluisterd' }).hits).toHaveLength(1);
  });
});

describe('back-up', () => {
  it('export → lege app → herstel geeft identieke gegevens', async () => {
    await loadSampleData();
    const it = (await db.items.toArray())[0];
    await repo.setField(it.id, 'dishes', 'Bitterballen');
    const before = await snapshot();
    const text = JSON.stringify(await exportBackup());
    switchDb(`test-${++n}-leeg`);
    await db.open();
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const plan = await applyRestore(parsed.backup, 'merge');
    expect(plan.added.items).toBe(before.items.length);
    const after = await snapshot();
    const sort = <T extends { id: string }>(a: T[]) => [...a].sort((x, y) => x.id.localeCompare(y.id));
    expect(sort(after.items)).toEqual(sort(before.items));
    expect(sort(after.sources)).toEqual(sort(before.sources));
    expect(sort(after.links)).toEqual(sort(before.links));
    expect(await db.revisions.count()).toBe(1);
  });

  it('samenvoegen overschrijft nooit nieuwere lokale wijzigingen en verwijdert niets', async () => {
    const a = await repo.createItem({ type: 'album', title: 'Oud' });
    const backup = await exportBackup();
    await repo.updateItem(a.id, { title: 'Nieuw lokaal' });
    const extra = await repo.createItem({ type: null, title: 'Alleen lokaal' });
    const plan = await applyRestore(backup, 'merge');
    expect(plan.kept.items).toBe(1);
    expect((await db.items.get(a.id))?.title).toBe('Nieuw lokaal');
    expect(await db.items.get(extra.id)).toBeTruthy();
  });

  it('herkent dezelfde bron met een andere id bij samenvoegen', async () => {
    const r = await repo.capture({ type: null, title: 'x', url: 'https://example.com/a' });
    const backup = await exportBackup();
    backup.data.sources[0] = { ...backup.data.sources[0], id: 'andere-id' };
    backup.data.links = backup.data.links.map((l) => ({ ...l, id: 'link-2', bId: 'andere-id' }));
    switchDb(`test-${++n}-dup`);
    await db.open();
    await repo.addSource({ url: 'https://www.example.com/a/' });
    await db.items.add(r.item);
    const plan = await planRestore(backup, 'merge');
    expect(plan.mergedSources).toBe(1);
    await applyRestore(backup, 'merge');
    expect(await db.sources.count()).toBe(1);
  });

  it('weigert ongeldige bestanden zonder iets te schrijven', async () => {
    expect(parseBackup('geen json').ok).toBe(false);
    expect(parseBackup('{"format":"iets anders"}').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ format: 'bijdehand-backup', formatVersion: 99, data: {} })).ok).toBe(false);
    const bad = parseBackup(JSON.stringify({ format: 'bijdehand-backup', formatVersion: 1, data: { items: [{ id: 'x', type: 'raket', createdAt: 'a', updatedAt: 'a' }], sources: [], links: [] } }));
    expect(bad.ok).toBe(false);
  });

  it('schema v5: items van verwijderde soorten gaan naar de Inbox, met alle gegevens bewaard', async () => {
    const r = parseBackup(JSON.stringify({ format: 'bijdehand-backup', formatVersion: 1, data: { items: [
      { id: 'b', type: 'book', title: 'Klara and the Sun', body: 'Van Sanne', fields: { author: 'Kazuo Ishiguro', status: 'wil' }, createdAt: 'a', updatedAt: 'a', schemaVersion: 4 },
      { id: 'n', type: null, title: 'Notitie', suggestion: { type: 'gift', reason: 'woord', by: 'regels' }, createdAt: 'a', updatedAt: 'a', schemaVersion: 4 },
    ], sources: [], links: [] } }));
    if (!r.ok) throw new Error(r.error);
    const [book, note] = r.backup.data.items;
    expect(book).toMatchObject({ type: null, title: 'Klara and the Sun', fields: { author: 'Kazuo Ishiguro', status: 'wil' }, schemaVersion: 5 });
    expect(book.body).toBe('Van Sanne\n\nWas: Boek (author: Kazuo Ishiguro; status: wil)');
    expect(note.suggestion).toBeNull();
    await applyRestore(r.backup, 'merge');
    expect((await db.items.get('b'))?.type).toBeNull();
  });

  it('vervangen zet exact de back-up terug', async () => {
    await repo.createItem({ type: 'album', title: 'In back-up' });
    const backup = await exportBackup();
    await repo.createItem({ type: 'album', title: 'Na back-up' });
    const plan = await applyRestore(backup, 'replace');
    expect(plan.removed.items).toBe(2);
    expect((await db.items.toArray()).map((i) => i.title)).toEqual(['In back-up']);
  });
});
