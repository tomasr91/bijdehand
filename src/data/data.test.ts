import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyRestore, exportBackup, parseBackup, planRestore } from './backup';
import { suggestType } from './classify';
import { db, switchDb } from './db';
import * as repo from './repo';
import { loadSampleData, removeSampleData } from './sample';
import { search } from './search';
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
    expect(suggestType('Hotel in Gent', 'https://www.booking.com/hotel/be/x.html')?.type).toBe('trip');
    expect(suggestType('cadeau voor mama')?.type).toBe('gift');
    expect(suggestType('paklijst skivakantie', null, 3)?.type).toBe('packing');
    expect(suggestType('iets willekeurigs')).toBeNull();
  });
});

describe('repository', () => {
  it('maakt, wijzigt, verwijdert en herstelt met historie', async () => {
    const item = await repo.createItem({ type: 'size', title: 'Broek', fields: { person: 'Ik', size: '32/34' } });
    await repo.setField(item.id, 'size', '33/34');
    const cur = await db.items.get(item.id);
    expect(cur?.fields.size).toBe('33/34');
    expect(cur?.rev).toBe(2);
    const revs = await db.revisions.where('entityId').equals(item.id).toArray();
    expect(revs).toHaveLength(1);
    expect((revs[0].snapshot as typeof cur)!.fields.size).toBe('32/34');
    await repo.deleteItem(item.id);
    expect((await db.items.get(item.id))?.deletedAt).toBeTruthy();
    await repo.restoreItem(item.id);
    expect((await db.items.get(item.id))?.deletedAt).toBeNull();
    await repo.restoreRevision(revs[0].id);
    expect((await db.items.get(item.id))?.fields.size).toBe('32/34');
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

  it('kopieert een basis-paklijst met alle regels open', async () => {
    const tpl = await repo.createItem({ type: 'packing', title: 'Basis', fields: { isTemplate: true }, checklist: [repo.entry('Oplader', true), repo.entry('Paspoort')] });
    const copy = await repo.copyPackingList(tpl.id, 'Reis Rome');
    expect(copy?.checklist.map((e) => [e.text, e.done])).toEqual([['Oplader', false], ['Paspoort', false]]);
    expect(copy?.fields.isTemplate).toBe(false);
  });

  it('plant verzorgd zet de volgende datum', async () => {
    const p = await repo.createItem({ type: 'plant', title: 'Monstera', fields: { intervalDays: 7 } });
    await repo.markPlantCared(p.id, '2026-10-24');
    const cur = await db.items.get(p.id);
    expect(cur?.fields.nextCare).toBe('2026-10-31');
    expect(cur?.fields.lastCare).toBe('2026-10-24');
  });
});

describe('zoeken', () => {
  it('beantwoordt voorbeeldvragen met tekst en filters', async () => {
    await loadSampleData();
    const data = await all();
    const titles = (q: string) => search(data, q).hits.map((h) => (h.kind === 'item' ? h.item.title : h.source.title));
    expect(titles('Welke restaurants wilde ik nog proberen?')).toEqual(['Bar Basiliek']);
    const gifts = titles('Welke cadeaus had ik voor mijn partner bedacht?');
    expect(gifts.slice(0, 2).sort()).toEqual(['Lego Botanicals bonsai', 'Pasta-cursus voor twee']);
    expect(gifts).not.toContain('Kaarsenpakket bijenwas');
    expect(titles('Welke games staan nog op mijn verlanglijst?')).toEqual(['Hades II']);
    expect(titles('klussen').sort()).toEqual(['Fietsverlichting vervangen', 'Lekkende kraan badkamer', 'Schilderijen ophangen gang']);
    expect(titles('gent')).toContain('Weekend Gent');
    expect(titles('graslei')).toContain('Hotel aan de Graslei');
    expect(titles('tiramisu')).toEqual(['Trattoria Da Marco']);
    expect(search(data, '', { type: 'inbox' }).hits).toHaveLength(2);
    expect(search(data, '', { type: 'book', status: 'wil' }).hits).toHaveLength(1);
  });
});

describe('back-up', () => {
  it('export → lege app → herstel geeft identieke gegevens', async () => {
    await loadSampleData();
    const it = (await db.items.toArray())[0];
    await repo.setField(it.id, 'status', 'gekocht');
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
    const a = await repo.createItem({ type: 'book', title: 'Oud' });
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

  it('vervangen zet exact de back-up terug', async () => {
    await repo.createItem({ type: 'book', title: 'In back-up' });
    const backup = await exportBackup();
    await repo.createItem({ type: 'book', title: 'Na back-up' });
    const plan = await applyRestore(backup, 'replace');
    expect(plan.removed.items).toBe(2);
    expect((await db.items.toArray()).map((i) => i.title)).toEqual(['In back-up']);
  });
});

describe('voorbeeldgegevens', () => {
  it('verwijdert alleen ongewijzigde voorbeelden', async () => {
    const count = await loadSampleData();
    const first = (await db.items.toArray())[0];
    await repo.updateItem(first.id, { title: 'Aangepast' });
    const r = await removeSampleData();
    expect(r.kept).toBe(1);
    expect(await db.items.count()).toBe(1);
    expect(r.removed).toBeGreaterThan(count - 1);
  });
});
