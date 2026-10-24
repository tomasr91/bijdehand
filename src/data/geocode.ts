// Adres → punt op de kaart via OpenStreetMap Nominatim (gratis, zonder sleutel). Zie docs/ARCHITECTURE.md → D16.
// Regels van Nominatim: hoogstens 1 verzoek per seconde en resultaten bewaren. Daarom zoekt de app elk adres één keer
// (bewaard als lat/lng + geoFor) en alleen opnieuw als het adres verandert. Alleen restaurants mét adres: een plaatsnaam
// alleen zou een punt midden in de stad geven, en dat is misleidend.
import { db } from './db';
import type { Item } from './model';
import { updateItem } from './repo';

type Fetch = typeof fetch;
let fetcher: Fetch = (...a) => fetch(...a);
let pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Alleen voor tests. */
export function setGeoFetcher(f: Fetch, p?: (ms: number) => Promise<void>): void {
  fetcher = f;
  if (p) pause = p;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Het adres zoals we het opzoeken: zonder toelichting tussen haakjes, met de plaats erbij als die er nog niet in staat. */
export function geoQuery(item: Item): string {
  const address = str(item.fields.address).replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim().replace(/,$/, '');
  if (!address) return '';
  const city = str(item.fields.city);
  return city && !address.toLowerCase().includes(city.toLowerCase()) ? `${address}, ${city}` : address;
}

export function hasLocation(item: Item): boolean {
  return typeof item.fields.lat === 'number' && typeof item.fields.lng === 'number';
}

/** Moet dit restaurant (opnieuw) opgezocht worden? */
export function needsGeocode(item: Item): boolean {
  const q = geoQuery(item);
  return item.type === 'restaurant' && !item.deletedAt && !!q && str(item.fields.geoFor) !== q;
}

async function lookup(q: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=nl&q=${encodeURIComponent(q)}`;
  const res = await fetcher(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`OpenStreetMap gaf fout ${res.status}`);
  const list = (await res.json()) as { lat?: string; lon?: string }[];
  const hit = list[0];
  const lat = Number(hit?.lat);
  const lng = Number(hit?.lon);
  return hit && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export interface GeocodeResult { found: number; notFound: string[]; failed: boolean }

/**
 * Zoekt de ontbrekende punten op, één per seconde. Niet gevonden = geoFor bewaren zonder punt (niet elke keer opnieuw).
 * Bij een netwerkfout stopt hij; de rest volgt de volgende keer.
 */
export async function geocodeMissing(ids: string[], onProgress?: (done: number, total: number) => void): Promise<GeocodeResult> {
  const todo = (await db.items.bulkGet(ids)).filter((i): i is Item => !!i && needsGeocode(i));
  const result: GeocodeResult = { found: 0, notFound: [], failed: false };
  for (let n = 0; n < todo.length; n++) {
    const item = todo[n];
    const q = geoQuery(item);
    if (n > 0) await pause(1100);
    let hit: { lat: number; lng: number } | null;
    try {
      hit = await lookup(q);
    } catch {
      result.failed = true;
      break;
    }
    await updateItem(item.id, (cur) => {
      const fields: Item['fields'] = { ...cur.fields, geoFor: q };
      if (hit) { fields.lat = Math.round(hit.lat * 1e6) / 1e6; fields.lng = Math.round(hit.lng * 1e6) / 1e6; }
      else { delete fields.lat; delete fields.lng; }
      return { fields };
    });
    if (hit) result.found++;
    else result.notFound.push(item.title);
    onProgress?.(n + 1, todo.length);
  }
  return result;
}
