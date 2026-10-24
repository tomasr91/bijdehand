import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyProposals, buildInboxExport, checkFields, parseProposals, undoApply } from './claude';
import { db, switchDb } from './db';
import * as repo from './repo';

let n = 0;
beforeEach(async () => {
  switchDb(`claude-${++n}`);
  await db.open();
});

async function setup() {
  const note = await repo.createItem({ type: null, title: 'Pamir Leiden', body: 'Afghaans, aanrader van Sanne' });
  const multi = await repo.createItem({ type: null, title: 'Lezen', body: 'Project Hail Mary - Andy Weir\nKlara and the Sun' });
  const done = await repo.createItem({ type: 'restaurant', title: 'Erfgoed', fields: { city: 'Leiden', traits: ['fancy'] } });
  const { source } = await repo.addSource({ url: 'https://example.org/boeken' });
  await repo.linkRecords('item', multi.id, 'source', source.id);
  return { note, multi, done, source };
}

describe('Inbox delen met Claude', () => {
  it('bevat alleen Inbox-items, het veldenschema en bekende waarden', async () => {
    await setup();
    const exp = buildInboxExport(await db.items.toArray(), await db.sources.toArray(), await db.links.toArray());
    expect(exp.format).toBe('bijdehand-inbox');
    expect(exp.items.map((i) => i.titel).sort()).toEqual(['Lezen', 'Pamir Leiden']);
    expect(exp.items.find((i) => i.titel === 'Lezen')?.links[0].url).toBe('https://example.org/boeken');
    expect(exp.soorten.find((s) => s.type === 'restaurant')?.velden.map((v) => v.veld)).toContain('traits');
    expect(exp.bekend['restaurant.city']).toEqual(['Leiden']);
    expect(exp.bekend['restaurant.traits']).toEqual(['fancy']);
  });
});

describe('voorstellen controleren', () => {
  it('controleert velden tegen het register', () => {
    expect(checkFields('restaurant', { city: 'Leiden', favorite: true, traits: ['fancy'], score: 7.5 }).problems).toEqual([]);
    expect(checkFields('book', { status: 'misschien' }).problems[0]).toMatch(/geen geldige keuze/);
    expect(checkFields('restaurant', { kleur: 'rood' }).problems[0]).toMatch(/onbekend veld/);
    expect(checkFields('book', { rating: 7 }).problems[0]).toMatch(/1 t\/m 5/);
    expect(checkFields('todo', { due: '24-10-2026' }).problems[0]).toMatch(/JJJJ-MM-DD/);
  });

  it('herkent fouten, gewijzigde items en twijfel', async () => {
    const { note, done } = await setup();
    const items = await db.items.toArray();
    const file = (voorstellen: unknown[]) => JSON.stringify({ format: 'bijdehand-voorstellen', formatVersion: 1, gebaseerdOp: '2000-01-01T00:00:00Z', voorstellen });
    expect(parseProposals('{}', items).ok).toBe(false);
    const r = parseProposals(file([
      { actie: 'indelen', itemId: note.id, type: 'restaurant', velden: { city: 'Leiden' } },
      { actie: 'indelen', itemId: done.id, type: 'restaurant', velden: {} },
      { actie: 'indelen', itemId: 'bestaat-niet', type: 'book', velden: {} },
      { actie: 'nieuw', type: 'raket', titel: 'x' },
      { actie: 'laten', itemId: note.id, reden: 'Welke stad?' },
    ]), items);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.rows.map((x) => x.status)).toEqual(['gewijzigd', 'gewijzigd', 'fout', 'fout', 'laten']);
  });
});

describe('voorstellen toepassen', () => {
  it('deelt in, splitst een aantekening en is volledig ongedaan te maken', async () => {
    const { note, multi, source } = await setup();
    const items = await db.items.toArray();
    const r = parseProposals(JSON.stringify({
      format: 'bijdehand-voorstellen', formatVersion: 1, gebaseerdOp: new Date(Date.now() + 1000).toISOString(),
      voorstellen: [
        { id: 'a', actie: 'indelen', itemId: note.id, type: 'restaurant', titel: 'Pamir', velden: { city: 'Leiden', cuisine: 'Afghaans' }, reden: 'restaurant + plaats' },
        { id: 'b', actie: 'nieuw', itemId: multi.id, type: 'book', titel: 'Project Hail Mary', velden: { author: 'Andy Weir', status: 'wil' } },
        { id: 'c', actie: 'nieuw', itemId: multi.id, type: 'book', titel: 'Klara and the Sun', velden: { status: 'wil' } },
      ],
    }), items);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.rows.every((x) => x.status === 'ok')).toBe(true);

    const res = await applyProposals(r.value.rows);
    expect([res.updated, res.created, res.trashed]).toEqual([1, 2, 1]);
    const pamir = await db.items.get(note.id);
    expect(pamir).toMatchObject({ type: 'restaurant', title: 'Pamir', body: 'Afghaans, aanrader van Sanne' });
    expect(pamir?.fields).toMatchObject({ city: 'Leiden', cuisine: 'Afghaans' });
    expect(pamir?.filledBy?.fields).toEqual(expect.arrayContaining(['type', 'title', 'city', 'cuisine']));
    const books = (await db.items.toArray()).filter((i) => i.type === 'book');
    expect(books.map((b) => b.title).sort()).toEqual(['Klara and the Sun', 'Project Hail Mary']);
    expect(books[0].origin?.ref).toContain('Project Hail Mary - Andy Weir');
    const bookLinks = (await db.links.toArray()).filter((l) => l.bId === source.id && books.some((b) => b.id === l.aId));
    expect(bookLinks).toHaveLength(2);
    expect((await db.items.get(multi.id))?.deletedAt).toBeTruthy(); // aantekening naar prullenbak, niet weg

    await undoApply(res.undo);
    expect((await db.items.get(note.id))).toMatchObject({ type: null, title: 'Pamir Leiden' });
    expect((await db.items.get(note.id))?.filledBy).toBeUndefined();
    expect((await db.items.toArray()).filter((i) => i.type === 'book')).toHaveLength(0);
    expect((await db.items.get(multi.id))?.deletedAt).toBeNull();
  });
});

describe('gedeeltelijk splitsen', () => {
  it('laat de aantekening staan als niet alle delen zijn toegepast', async () => {
    const { multi } = await setup();
    const r = parseProposals(JSON.stringify({
      format: 'bijdehand-voorstellen', formatVersion: 1,
      voorstellen: [
        { actie: 'nieuw', itemId: multi.id, type: 'book', titel: 'A' },
        { actie: 'nieuw', itemId: multi.id, type: 'book', titel: 'B' },
        { actie: 'nieuw', itemId: multi.id, type: 'book', titel: 'C', velden: { kleur: 'x' } },
      ],
    }), await db.items.toArray());
    if (!r.ok) throw new Error(r.error);
    // Alles gekozen wat kan, maar C is ongeldig.
    let res = await applyProposals(r.value.rows, r.value.rows);
    expect(res.trashed).toBe(0);
    await undoApply(res.undo);
    // Alleen A gekozen: ook dan blijft de aantekening staan.
    res = await applyProposals([r.value.rows[0]], r.value.rows);
    expect(res.trashed).toBe(0);
    expect((await db.items.get(multi.id))?.deletedAt).toBeNull();
  });
});

describe('aanvullen van bestaande items', () => {
  it('ververst opgezochte velden, raakt eigen velden niet aan, koppelt links en is ongedaan te maken', async () => {
    const r1 = await repo.createItem({ type: 'restaurant', title: 'Pamir', fields: { city: 'Leiden', cuisine: 'Perzisch', traits: ['reserveren'], score: 6 } });
    const file = (v: unknown[]) => JSON.stringify({ format: 'bijdehand-voorstellen', formatVersion: 1, voorstellen: v });
    const r = parseProposals(file([
      { actie: 'aanvullen', type: 'restaurant', zoek: { titel: 'pamir', city: 'Leiden' }, velden: { cuisine: 'Afghaans', address: 'Breestraat 10', traits: ['betaalbaar'], googleRating: 4.7, googleCount: 1847, checkedAt: '2026-10-24' }, links: [{ url: 'http://pamir.example/', titel: 'Website Pamir' }] },
      { actie: 'aanvullen', type: 'restaurant', zoek: { titel: 'Bestaat niet' }, velden: {} },
    ]), await db.items.toArray());
    if (!r.ok) throw new Error(r.error);
    expect(r.value.rows.map((x) => x.status)).toEqual(['ok', 'fout']);
    const res = await applyProposals(r.value.rows);
    const cur = await db.items.get(r1.id);
    expect(cur?.fields).toMatchObject({ cuisine: 'Perzisch', score: 6, address: 'Breestraat 10', googleRating: 4.7, googleCount: 1847, traits: ['reserveren', 'betaalbaar'] });
    expect(cur?.filledBy?.fields).toEqual(expect.arrayContaining(['address', 'googleRating', 'traits', 'links']));
    expect(cur?.filledBy?.fields).not.toContain('cuisine');
    const src = await db.sources.toArray();
    expect(src).toHaveLength(1);
    expect(src[0].infoVia).toBe('opgezocht');
    expect(await db.links.count()).toBe(1);

    // Tweede keer: cijfer ververst, geen dubbele bron of koppeling.
    const r2 = parseProposals(file([{ actie: 'aanvullen', type: 'restaurant', zoek: { titel: 'Pamir' }, velden: { googleRating: 4.8 }, links: [{ url: 'https://www.pamir.example' }] }]), await db.items.toArray());
    if (!r2.ok) throw new Error(r2.error);
    const res2 = await applyProposals(r2.value.rows);
    expect((await db.items.get(r1.id))?.fields.googleRating).toBe(4.8);
    expect(await db.sources.count()).toBe(1);
    expect(await db.links.count()).toBe(1);
    await undoApply(res2.undo);
    await undoApply(res.undo);
    expect((await db.items.get(r1.id))?.fields).toEqual({ city: 'Leiden', cuisine: 'Perzisch', traits: ['reserveren'], score: 6 });
    expect(await db.sources.count()).toBe(0);
    expect(await db.links.count()).toBe(0);
  });
});

describe('aanvullen: leegmaken en website', () => {
  it('maakt alleen opgezochte velden leeg, nooit eigen velden; website moet een link zijn', async () => {
    const it0 = await repo.createItem({ type: 'restaurant', title: 'Mossa', fields: { city: 'Leiden', cuisine: 'Veganistisch', uncertain: 'Adres onzeker' } });
    const file = (velden: unknown) => JSON.stringify({ format: 'bijdehand-voorstellen', formatVersion: 1, voorstellen: [{ actie: 'aanvullen', type: 'restaurant', zoek: { titel: 'Mossa' }, velden }] });
    const bad = parseProposals(file({ website: 'mossa.nl' }), await db.items.toArray());
    if (!bad.ok) throw new Error(bad.error);
    expect(bad.value.rows[0].status).toBe('fout');
    const r = parseProposals(file({ uncertain: null, cuisine: null, website: 'http://www.mossa.nl/' }), await db.items.toArray());
    if (!r.ok) throw new Error(r.error);
    await applyProposals(r.value.rows);
    const cur = await db.items.get(it0.id);
    expect(cur?.fields).toMatchObject({ cuisine: 'Veganistisch', uncertain: null, website: 'http://www.mossa.nl/' });
    expect(cur?.filledBy?.fields).toEqual(expect.arrayContaining(['uncertain', 'website']));
  });
});

describe('dubbele items voorkomen en verwijderen', () => {
  const file = (v: unknown[]) => JSON.stringify({ format: 'bijdehand-voorstellen', formatVersion: 1, voorstellen: v });

  it('slaat een voorstel over voor iets dat er al staat of twee keer in het bestand staat; de aantekening telt als afgehandeld', async () => {
    await repo.createItem({ type: 'restaurant', title: 'Pamir', fields: { city: 'Leiden' } });
    const note = await repo.createItem({ type: null, title: 'Pamir, Groen' });
    const r = parseProposals(file([
      { actie: 'nieuw', itemId: note.id, type: 'restaurant', titel: 'pamir', velden: { city: 'Leiden' } },
      { actie: 'nieuw', itemId: note.id, type: 'restaurant', titel: 'Groen', velden: { city: 'Leiden' } },
      { actie: 'nieuw', itemId: note.id, type: 'restaurant', titel: 'Groen', velden: { city: 'Leiden' } },
      { actie: 'nieuw', type: 'restaurant', titel: 'Pamir', velden: { city: 'Haarlem' } },
    ]), await db.items.toArray());
    if (!r.ok) throw new Error(r.error);
    expect(r.value.rows.map((x) => [x.status, x.duplicate ?? false])).toEqual([['gewijzigd', true], ['ok', false], ['gewijzigd', true], ['ok', false]]);
    expect(r.value.rows[0].problem).toMatch(/staat al in Restaurants/);
    const ok = r.value.rows.filter((x) => x.status === 'ok');
    await applyProposals(ok, r.value.rows);
    const titles = (await db.items.toArray()).filter((i) => i.type === 'restaurant' && !i.deletedAt).map((i) => `${i.title}/${i.fields.city}`).sort();
    expect(titles).toEqual(['Groen/Leiden', 'Pamir/Haarlem', 'Pamir/Leiden']);
    expect((await db.items.get(note.id))?.deletedAt).toBeTruthy(); // volledig afgehandeld
  });

  it('verwijderen: alleen met itemId, naar de prullenbak, terug te draaien', async () => {
    const a = await repo.createItem({ type: 'restaurant', title: 'Dubbel', fields: { city: 'Leiden' } });
    const bad = parseProposals(file([{ actie: 'verwijderen', zoek: { titel: 'Dubbel' } }]), await db.items.toArray());
    if (!bad.ok) throw new Error(bad.error);
    expect(bad.value.rows[0].status).toBe('fout');
    const r = parseProposals(file([{ actie: 'verwijderen', itemId: a.id, reden: 'dubbel' }]), await db.items.toArray());
    if (!r.ok) throw new Error(r.error);
    expect(r.value.rows[0].status).toBe('ok');
    const res = await applyProposals(r.value.rows);
    expect(res.trashed).toBe(1);
    expect((await db.items.get(a.id))?.deletedAt).toBeTruthy();
    await undoApply(res.undo);
    expect((await db.items.get(a.id))?.deletedAt).toBeNull();
  });
});

describe('aanvullen: labels weghalen en herschikken', () => {
  it('haalt alleen de genoemde waarden weg; eigen labels blijven; ongedaan maken herstelt', async () => {
    const it0 = await repo.createItem({ type: 'restaurant', title: 'Pamir', fields: { city: 'Leiden', traits: ['reserveren', 'aan de werf', 'Laat open'] } });
    const file = (v: object) => JSON.stringify({ format: 'bijdehand-voorstellen', formatVersion: 1, voorstellen: [{ actie: 'aanvullen', type: 'restaurant', zoek: { titel: 'Pamir' }, ...v }] });
    const bad = parseProposals(file({ weghalen: { city: ['Leiden'] } }), await db.items.toArray());
    if (!bad.ok) throw new Error(bad.error);
    expect(bad.value.rows[0].problem).toMatch(/geen lijstveld/);
    const r = parseProposals(file({ weghalen: { traits: ['aan de werf', 'laat open', 'bestaat niet'] }, velden: { traits: ['afghaans'] } }), await db.items.toArray());
    if (!r.ok) throw new Error(r.error);
    expect(r.value.rows[0].status).toBe('ok');
    const res = await applyProposals(r.value.rows);
    expect((await db.items.get(it0.id))?.fields.traits).toEqual(['reserveren', 'afghaans']);
    await undoApply(res.undo);
    expect((await db.items.get(it0.id))?.fields.traits).toEqual(['reserveren', 'aan de werf', 'Laat open']);
  });
});

describe('aanvullen verbetert eerder door Claude ingevulde eigen velden', () => {
  it('overschrijft wat Claude invulde, maar niet na "Gecontroleerd"', async () => {
    const it0 = await repo.createItem({ type: 'restaurant', title: 'Groen', fields: { city: 'Leiden' } });
    const run = async (address: string) => {
      const r = parseProposals(JSON.stringify({ format: 'bijdehand-voorstellen', formatVersion: 1, voorstellen: [{ actie: 'aanvullen', type: 'restaurant', zoek: { titel: 'Groen' }, velden: { address } }] }), await db.items.toArray());
      if (!r.ok) throw new Error(r.error);
      await applyProposals(r.value.rows);
      return (await db.items.get(it0.id))?.fields.address;
    };
    expect(await run('Haarlemsestraatweg')).toBe('Haarlemsestraatweg');
    expect(await run('Haarlemsestraatweg 113')).toBe('Haarlemsestraatweg 113');
    await db.items.update(it0.id, { filledBy: null }); // gebruiker tikt op "Gecontroleerd"
    expect(await run('Ergens anders 1')).toBe('Haarlemsestraatweg 113');
  });
});
