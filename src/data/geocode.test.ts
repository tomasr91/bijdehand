import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, switchDb } from './db';
import { geocodeMissing, geoQuery, needsGeocode, setGeoFetcher } from './geocode';
import * as repo from './repo';

let k = 0;
beforeEach(() => { switchDb(`geo-${++k}`); });

const fake = (answers: Record<string, [number, number] | null>, calls: string[]) => {
  setGeoFetcher(async (input) => {
    const u = new URL(String(input));
    const q = u.searchParams.get('q')!;
    if (u.hostname === 'api.pdok.nl') return new Response(JSON.stringify({ response: { docs: [] } }), { status: 200 });
    calls.push(q);
    if (!(q in answers)) return new Response('[]', { status: 200 });
    const a = answers[q];
    return new Response(JSON.stringify(a ? [{ lat: String(a[0]), lon: String(a[1]) }] : []), { status: 200 });
  }, async () => {});
};

describe('locaties opzoeken', () => {
  it('maakt een nette zoekvraag: zonder haakjes, plaats erbij als die ontbreekt; zonder adres niets', async () => {
    const a = await repo.createItem({ type: 'restaurant', title: 'Pamir', fields: { city: 'Leiden', address: 'Breestraat 10 (centrum)' } });
    const b = await repo.createItem({ type: 'restaurant', title: 'Groen', fields: { city: 'Leiden', address: 'Haarlemmerstraat 5, 2312 DL Leiden' } });
    const c = await repo.createItem({ type: 'restaurant', title: 'Zonder adres', fields: { city: 'Leiden' } });
    expect(geoQuery(a)).toBe('Breestraat 10, Leiden');
    expect(geoQuery(b)).toBe('Haarlemmerstraat 5, 2312 DL Leiden');
    expect(needsGeocode(c)).toBe(false);
  });

  it('bewaart gevonden punten, onthoudt "niet gevonden" en zoekt opnieuw als het adres verandert', async () => {
    const calls: string[] = [];
    fake({ 'Breestraat 10, Leiden': [52.1601234567, 4.4901234567], 'Nergensstraat 1, Leiden': null }, calls);
    const a = await repo.createItem({ type: 'restaurant', title: 'Pamir', fields: { city: 'Leiden', address: 'Breestraat 10' } });
    const b = await repo.createItem({ type: 'restaurant', title: 'Weg', fields: { city: 'Leiden', address: 'Nergensstraat 1' } });
    const r = await geocodeMissing([a.id, b.id]);
    expect(r).toEqual({ found: 1, notFound: ['Weg'], failed: false });
    expect((await db.items.get(a.id))?.fields).toMatchObject({ lat: 52.160123, lng: 4.490123, geoFor: 'Breestraat 10, Leiden' });
    expect((await db.items.get(b.id))?.fields.lat).toBeUndefined();
    // Tweede keer: niets opnieuw opzoeken.
    await geocodeMissing([a.id, b.id]);
    expect(calls).toHaveLength(2);
    // Adres gecorrigeerd: wel opnieuw.
    await repo.setField(b.id, 'address', 'Breestraat 10');
    await geocodeMissing([b.id]);
    expect(calls).toHaveLength(3);
    expect((await db.items.get(b.id))?.fields.lat).toBe(52.160123);
  });

  it('gebruikt eerst PDOK (Nederlandse adressen) en valt terug op OpenStreetMap; plaatsniveau telt niet', async () => {
    const asked: string[] = [];
    setGeoFetcher(async (input) => {
      const u = new URL(String(input));
      asked.push(u.hostname);
      if (u.hostname === 'api.pdok.nl') {
        const q = u.searchParams.get('q')!;
        const doc = q.startsWith('Breestraat') ? { type: 'adres', centroide_ll: 'POINT(4.49 52.159)' } : { type: 'woonplaats', centroide_ll: 'POINT(4.4 52.1)' };
        return new Response(JSON.stringify({ response: { docs: [doc] } }), { status: 200 });
      }
      return new Response(JSON.stringify([{ lat: '48.85', lon: '2.35' }]), { status: 200 });
    }, async () => {});
    const a = await repo.createItem({ type: 'restaurant', title: 'Pamir', fields: { city: 'Leiden', address: 'Breestraat 10' } });
    const b = await repo.createItem({ type: 'restaurant', title: 'Parijs', fields: { city: 'Parijs', address: 'Rue de Rivoli 1' } });
    await geocodeMissing([a.id, b.id]);
    expect((await db.items.get(a.id))?.fields).toMatchObject({ lat: 52.159, lng: 4.49 });
    expect((await db.items.get(b.id))?.fields).toMatchObject({ lat: 48.85, lng: 2.35 });
    expect(asked).toEqual(['api.pdok.nl', 'api.pdok.nl', 'nominatim.openstreetmap.org']);
  });

  it('herhaalt een mislukt verzoek en gaat door met de volgende', async () => {
    let n = 0;
    setGeoFetcher(async (input) => {
      const u = new URL(String(input));
      n++;
      if (n <= 2) throw new TypeError('even weg'); // eerste poging: PDOK en OSM falen
      if (u.hostname === 'api.pdok.nl') return new Response(JSON.stringify({ response: { docs: [{ type: 'adres', centroide_ll: 'POINT(4.49 52.159)' }] } }), { status: 200 });
      return new Response('[]', { status: 200 });
    }, async () => {});
    const a = await repo.createItem({ type: 'restaurant', title: 'Pamir', fields: { city: 'Leiden', address: 'Breestraat 10' } });
    const r = await geocodeMissing([a.id]);
    expect(r).toMatchObject({ found: 1, failed: false });
  });

  it('stopt bij een netwerkfout zonder iets kapot te maken', async () => {
    setGeoFetcher(async () => { throw new TypeError('offline'); }, async () => {});
    const a = await repo.createItem({ type: 'restaurant', title: 'Pamir', fields: { city: 'Leiden', address: 'Breestraat 10' } });
    const r = await geocodeMissing([a.id]);
    expect(r.failed).toBe(true);
    expect((await db.items.get(a.id))?.fields.geoFor).toBeUndefined();
  });
});
