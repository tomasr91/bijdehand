import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { parseBackup } from './backup';
import { BijdehandDB, db, switchDb } from './db';
import { parseLines, splitLines } from './paste';
import * as repo from './repo';
import { search } from './search';
import { checkFields } from './claude';
import { statusOf } from './itemTypes';
import { migrateItem } from './migrate';
import type { FieldValue } from './model';
import { formatScore, parseScore } from './util';

// Verzonnen lijst zoals uit Keep geplakt (met typfout, puntkomma, spaties en wisselende hoofdletters).
const LIJST = `Zwolle - warung sedap
Zwolle - de rookplank 
Zwolle - het hoekje (kleine gerechtjes, klein restaurantje, reserveren)
Leiden - curryhuis
Leiden - Mossa
Leiden - de zoete inval 
Leiden - Ooievaar
Leiden - vis en zee
Leiden - tuinjongens
Leiden - smulhof
Leiden - restaurant 512 (fancy)
Leiden - Pamir (Afghaans)
Leiden - groen (vegetarisch NOORD)
Haarlem - bella voce (zingende bediening);
Leiden - erfgoed (fancy)`;

describe('lijst plakken: restaurants', () => {
  const rows = parseLines('restaurant', LIJST);
  const by = (t: string) => rows.find((r) => r.title === t)!;

  it('maakt van elke regel één restaurant met plaats', () => {
    expect(rows).toHaveLength(15);
    expect(rows.filter((r) => r.fields.city === 'Leiden')).toHaveLength(11);
    expect(rows.filter((r) => r.fields.city === 'Zwolle')).toHaveLength(3);
    expect(by('Bella voce').fields.city).toBe('Haarlem');
    expect(rows.every((r) => r.fields.status === undefined)).toBe(true);
  });

  it('herkent keuken en kenmerken; wat niet past gaat naar de notitie', () => {
    expect(by('Pamir').fields.cuisine).toBe('Afghaans');
    expect(by('Pamir').fields.traits).toBeUndefined();
    expect(by('Het hoekje').fields.traits).toEqual(['kleine gerechtjes', 'klein restaurantje', 'reserveren']);
    expect(by('Restaurant 512').fields.traits).toEqual(['fancy']);
    expect(by('Erfgoed').fields.traits).toEqual(['fancy']);
    expect(by('Bella voce').fields.traits).toEqual(['zingende bediening']);
    expect(by('Groen').fields.traits).toEqual(['vegetarisch']);
    expect(by('Groen').note).toBe('NOORD');
  });

  it('bewaart de oorspronkelijke regel en past namen niet verder aan dan de eerste hoofdletter', () => {
    expect(by('Warung sedap').line).toBe('Zwolle - warung sedap');
    expect(by('De zoete inval')).toBeTruthy();
    expect(by('De rookplank')).toBeTruthy();
  });

  it('negeert opsommingstekens en lege regels', () => {
    expect(splitLines('- a\n\n• b\n[ ] c\n1. d;\n')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('opslaan, terugvinden op kenmerk/keuken en ongedaan maken', async () => {
    switchDb('paste-1');
    await db.open();
    const ids = await repo.createPasted('restaurant', rows);
    const items = await db.items.toArray();
    expect(items).toHaveLength(15);
    expect(items.find((i) => i.title === 'Groen')?.origin).toMatchObject({ system: 'paste', ref: 'Leiden - groen (vegetarisch NOORD)' });
    const data = { items, sources: [], links: [] };
    const titles = (q: string) => search(data, q).hits.map((h) => (h.kind === 'item' ? h.item.title : ''));
    expect(titles('fancy utrecht').sort()).toEqual(['Erfgoed', 'Restaurant 512']);
    expect(titles('afghaans')).toEqual(['Pamir']);
    expect(titles('vegetarisch')).toEqual(['Groen']);
    // Eén item wijzigen; ongedaan maken laat dat item staan.
    await repo.setField(ids[0], 'score', 8);
    expect(await repo.undoPasted(ids)).toBe(14);
    expect(await db.items.count()).toBe(1);
  });
});

describe('schema v4: restaurantstatus volgt uit het cijfer, favoriet wordt een hartje', () => {
  it('zet status om zonder iets te verliezen', () => {
    const base = { id: 'x', title: 'X', body: '', checklist: [], tags: [], createdAt: 'a', updatedAt: 'a', deletedAt: null, rev: 1, origin: null, suggestion: null, schemaVersion: 3 };
    const m = (fields: Record<string, FieldValue>) => migrateItem({ ...base, type: 'restaurant', fields }).fields;
    expect(m({ status: 'proberen', city: 'Leiden' })).toEqual({ city: 'Leiden' });
    expect(m({ status: 'geweest', score: 7 })).toEqual({ score: 7 });
    expect(m({ status: 'geweest' })).toEqual({ visited: true });
    expect(m({ status: 'favoriet', score: 9 })).toEqual({ score: 9, favorite: true });
    expect(m({ status: 'favoriet' })).toEqual({ favorite: true, visited: true });
    expect(migrateItem({ ...base, type: 'book', fields: { status: 'wil' } }).fields).toEqual({ status: 'wil' });
  });

  it('afgeleide status: filter en zoeken', async () => {
    const a = await repo.createItem({ type: 'restaurant', title: 'Geweest', fields: { score: 8 } });
    const b = await repo.createItem({ type: 'restaurant', title: 'Oud geweest', fields: { visited: true } });
    const c = await repo.createItem({ type: 'restaurant', title: 'Nieuw', fields: { favorite: true } });
    expect([a, b, c].map(statusOf)).toEqual(['geweest', 'geweest', 'niet']);
    const data = { items: await db.items.toArray(), sources: [], links: [] };
    expect(search(data, '', { type: 'restaurant', status: 'niet' }).hits.map((h) => h.kind === 'item' && h.item.title)).toEqual(['Nieuw']);
    expect(search(data, 'restaurant proberen').hits.map((h) => h.kind === 'item' && h.item.title)).toEqual(['Nieuw']);
    expect(search(data, 'favoriet').hits.map((h) => h.kind === 'item' && h.item.title)).toEqual(['Nieuw']);
  });
});

describe('schema v3: restaurant-sterren worden een eigen cijfer 1–10', () => {
  it('zet sterren × 2 om bij openen; andere soorten houden hun sterren', async () => {
    const old = new Dexie('migratie-2');
    const stores = { items: 'id, type, updatedAt, createdAt, deletedAt', sources: 'id, normalizedUrl, updatedAt, deletedAt', links: 'id, aId, bId, deletedAt', revisions: 'id, entityId, [entityId+changedAt]', meta: 'key' };
    old.version(1).stores(stores);
    old.version(2).stores({});
    const base = { body: '', checklist: [], tags: [], createdAt: 'a', updatedAt: 'a', deletedAt: null, rev: 1, origin: null, suggestion: null, schemaVersion: 2 };
    await old.table('items').add({ ...base, id: 'r1', type: 'restaurant', title: 'Da Marco', fields: { city: 'Zwolle', rating: 4 } });
    await old.table('items').add({ ...base, id: 'r2', type: 'restaurant', title: 'Pho', fields: { city: 'Haarlem' } });
    await old.table('items').add({ ...base, id: 'b1', type: 'book', title: 'Boek', fields: { rating: 4 } });
    old.close();
    const nieuw = new BijdehandDB('migratie-2');
    expect((await nieuw.items.get('r1'))?.fields).toEqual({ city: 'Zwolle', score: 8 });
    expect((await nieuw.items.get('r2'))?.fields).toEqual({ city: 'Haarlem' });
    expect((await nieuw.items.get('b1'))?.fields).toEqual({ rating: 4 });
    expect((await nieuw.items.get('r1'))?.schemaVersion).toBe(4);
    nieuw.close();
  });

  it('cijfer: komma of punt, afgerond op één decimaal, alleen 1 t/m 10', () => {
    expect(parseScore('7,5')).toBe(7.5);
    expect(parseScore('8.25')).toBe(8.3);
    expect(parseScore('10')).toBe(10);
    expect(parseScore('0,5')).toBeNull();
    expect(parseScore('11')).toBeNull();
    expect(parseScore('abc')).toBeNull();
    expect(formatScore(7.5)).toBe('7,5');
    expect(formatScore(8)).toBe('8');
    expect(checkFields('restaurant', { score: 12 }).problems[0]).toMatch(/1 t\/m 10/);
    expect(checkFields('restaurant', { rating: 4 }).problems[0]).toMatch(/onbekend veld/);
  });
});

describe('schema v2: restaurant "location" wordt "city"', () => {
  it('migreert bestaande gegevens bij het openen van de database', async () => {
    const old = new Dexie('migratie-1');
    old.version(1).stores({ items: 'id, type, updatedAt, createdAt, deletedAt', sources: 'id, normalizedUrl, updatedAt, deletedAt', links: 'id, aId, bId, deletedAt', revisions: 'id, entityId, [entityId+changedAt]', meta: 'key' });
    await old.table('items').add({ id: 'r1', type: 'restaurant', title: 'Da Marco', body: '', fields: { location: 'Zwolle', status: 'favoriet' }, checklist: [], tags: [], createdAt: 'a', updatedAt: 'a', deletedAt: null, rev: 1, origin: null, suggestion: null, schemaVersion: 1 });
    await old.table('items').add({ id: 'p1', type: 'plant', title: 'Monstera', body: '', fields: { location: 'Woonkamer' }, checklist: [], tags: [], createdAt: 'a', updatedAt: 'a', deletedAt: null, rev: 1, origin: null, suggestion: null, schemaVersion: 1 });
    old.close();
    const nieuw = new BijdehandDB('migratie-1');
    const r = await nieuw.items.get('r1');
    expect(r?.fields).toEqual({ city: 'Zwolle', favorite: true, visited: true });
    expect(r?.schemaVersion).toBe(4);
    expect((await nieuw.items.get('p1'))?.fields).toEqual({ location: 'Woonkamer' }); // planten houden "location"
  });

  it('migreert een back-up uit versie 1 bij het terugzetten', () => {
    const backup = {
      format: 'bijdehand-backup', formatVersion: 1, schemaVersion: 1, exportedAt: 'x',
      data: { items: [{ id: 'r1', type: 'restaurant', title: 'Pho', fields: { location: 'Haarlem', traits: ['betaalbaar', 3] }, createdAt: 'a', updatedAt: 'a', schemaVersion: 1 }], sources: [], links: [] },
    };
    const r = parseBackup(JSON.stringify(backup));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.backup.data.items[0].fields).toEqual({ city: 'Haarlem', traits: ['betaalbaar'] });
  });
});
