import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyProposals, checkFields, parseProposals } from './claude';
import { suggestType } from './classify';
import { db, switchDb } from './db';
import { geoQuery, needsGeocode } from './geocode';
import { statusOf } from './itemTypes';
import { parseLines } from './paste';
import * as repo from './repo';

let n = 0;
beforeEach(async () => {
  switchDb(`places-${++n}`);
  await db.open();
});

describe('uitjes en dates (plek-soorten)', () => {
  it('hebben dezelfde velden als restaurants: plaats, labels, cijfer, adres', () => {
    for (const t of ['activity', 'date'] as const) {
      expect(checkFields(t, { city: 'Utrecht', traits: ['buiten'], score: 8, favorite: true, address: 'Dorpsstraat 1, 3500 AA Utrecht' }).problems).toEqual([]);
      expect(checkFields(t, { cuisine: 'Frans' }).problems[0]).toMatch(/onbekend veld/);
    }
  });

  it('"geweest" volgt uit het cijfer, net als bij restaurants', async () => {
    const a = await repo.createItem({ type: 'activity', title: 'Kinderboerderij', fields: { city: 'Utrecht' } });
    expect(statusOf(a)).toBe('niet');
    const b = await repo.createItem({ type: 'date', title: 'Wijnproeverij', fields: { city: 'Utrecht', score: 7 } });
    expect(statusOf(b)).toBe('geweest');
  });

  it('krijgen een punt op de kaart zodra er een adres is', async () => {
    const a = await repo.createItem({ type: 'activity', title: 'Speeltuin', fields: { city: 'Utrecht', address: 'Dorpsstraat 1' } });
    expect(geoQuery(a)).toBe('Dorpsstraat 1, Utrecht');
    expect(needsGeocode(a)).toBe(true);
    const album = await repo.createItem({ type: 'album', title: 'Blue', fields: { address: 'Dorpsstraat 1' } });
    expect(needsGeocode(album)).toBe(false);
  });

  it('plakt een lijst: kenmerken zonder keuken', () => {
    const [r] = parseLines('activity', 'Utrecht - Kinderboerderij Zuid (dieren, buiten)');
    expect(r.title).toBe('Kinderboerderij Zuid');
    expect(r.fields).toEqual({ city: 'Utrecht', traits: ['dieren', 'buiten'] });
  });

  it('stelt een soort voor op basis van woorden', () => {
    expect(suggestType('Uitje met kinderen - diemerbos')?.type).toBe('activity');
    expect(suggestType('Date night in Utrecht')?.type).toBe('date');
  });

  it('Claude kan een Inbox-item indelen als uitje of date, met duplicaatcontrole', async () => {
    const a = await repo.createItem({ type: null, title: 'Uitje met kinderen - diemerbos' });
    const b = await repo.createItem({ type: null, title: 'Wijnproeverij Amersfoort' });
    const items = await db.items.toArray();
    const r = parseProposals(JSON.stringify({
      format: 'bijdehand-voorstellen', formatVersion: 1, gebaseerdOp: new Date(Date.now() + 1000).toISOString(),
      voorstellen: [
        { id: 'a', actie: 'indelen', itemId: a.id, type: 'activity', titel: 'Diemerbos', velden: { city: 'Amsterdam', traits: ['natuur', 'buiten'] } },
        { id: 'b', actie: 'indelen', itemId: b.id, type: 'date', titel: 'Wijnproeverij', velden: { city: 'Amersfoort', traits: ['eten en drinken'] } },
      ],
    }), items);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.rows.map((x) => x.status)).toEqual(['ok', 'ok']);
    await applyProposals(r.value.rows);
    expect((await db.items.get(a.id))?.type).toBe('activity');
    expect((await db.items.get(b.id))?.type).toBe('date');
  });
});

describe('congressen', () => {
  it('Claude kan een Inbox-item indelen als congres, met datums', async () => {
    const a = await repo.createItem({ type: null, title: 'Pydata', body: 'Data & AI databricks' });
    const items = await db.items.toArray();
    const r = parseProposals(JSON.stringify({
      format: 'bijdehand-voorstellen', formatVersion: 1, gebaseerdOp: new Date(Date.now() + 1000).toISOString(),
      voorstellen: [{ id: 'a', actie: 'indelen', itemId: a.id, type: 'conference', titel: 'PyData Amsterdam', velden: { startDate: '2027-09-10', city: 'Amsterdam', website: 'https://example.org' } }],
    }), items);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.rows.map((x) => x.status)).toEqual(['ok']);
    await applyProposals(r.value.rows);
    const got = await db.items.get(a.id);
    expect(got?.type).toBe('conference');
    expect(got?.body).toContain('Data & AI databricks');
    expect(got?.fields.startDate).toBe('2027-09-10');
    expect(checkFields('conference', { startDate: '12-03-2027' }).problems[0]).toMatch(/JJJJ-MM-DD/);
  });

  it('stelt congres voor bij woorden als conferentie of meetup', () => {
    expect(suggestType('Nieuwe conferentie over data')?.type).toBe('conference');
    expect(suggestType('PyData meetup')?.type).toBe('conference');
  });
});

describe('kleding', () => {
  it('herkent merk, stukken en maten uit een geplakte regel', async () => {
    const { parseClothing, sizeParts } = await import('./paste');
    expect(parseClothing('Cavallaro broek S, trui M, shirt S')).toMatchObject({ title: 'Cavallaro', fields: { sizes: ['broek S', 'trui M', 'shirt S'] } });
    expect(parseClothing('Cast Iron Polo M, blouse S/M')).toMatchObject({ title: 'Cast Iron', fields: { sizes: ['polo M', 'blouse S/M'] } });
    expect(parseClothing('Scotch soda shirt S/M, overhemd S')).toMatchObject({ title: 'Scotch soda', fields: { sizes: ['shirt S/M', 'overhemd S'] } });
    expect(parseClothing('Les deux trui S')).toMatchObject({ title: 'Les deux', fields: { sizes: ['trui S'] } });
    expect(parseClothing('Law of the sea shirt S')).toMatchObject({ title: 'Law of the sea', fields: { sizes: ['shirt S'] } });
    expect(parseClothing('Levi\'s 501 32/34')).toMatchObject({ title: 'Levi\'s', fields: { sizes: ['501 32/34'] } });
    expect(sizeParts('blouse s/m')).toEqual({ piece: 'Blouse', size: 'S/M' });
    expect(sizeParts('regenjas')).toEqual({ piece: 'Regenjas', size: '' });
  });

  it('Claude kan een merk aanvullen: nieuwe stukken erbij, bestaande blijven', async () => {
    await repo.createItem({ type: 'clothing', title: 'Bergvos', fields: { sizes: ['broek M'] } });
    const items = await db.items.toArray();
    const r = parseProposals(JSON.stringify({
      format: 'bijdehand-voorstellen', formatVersion: 1, gebaseerdOp: new Date(Date.now() + 1000).toISOString(),
      voorstellen: [{ id: 'a', actie: 'aanvullen', type: 'clothing', zoek: { titel: 'Bergvos' }, velden: { sizes: ['trui L'] } }],
    }), items);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.rows.map((x) => x.status)).toEqual(['ok']);
    await applyProposals(r.value.rows);
    const got = (await db.items.toArray()).find((i) => i.title === 'Bergvos');
    expect(got?.fields.sizes).toEqual(['broek M', 'trui L']);
  });
});
