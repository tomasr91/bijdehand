// Adres → punt op de kaart. Zie docs/ARCHITECTURE.md → D16/D17.
// 1. PDOK Locatieserver (Nederlandse overheid, gratis, nauwkeurig voor Nederlandse adressen).
// 2. Valt terug op OpenStreetMap Nominatim (buitenland, of als PDOK niets precies genoeg vindt; hoogstens 1 verzoek/s).
// Elk adres wordt één keer gezocht (bewaard als lat/lng + geoFor) en alleen opnieuw als het adres verandert.
// Alleen restaurants mét adres: een plaatsnaam alleen zou een punt midden in de stad geven, en dat is misleidend.
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

type Point = { lat: number; lng: number };
class LookupError extends Error {}

async function getJson(url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetcher(url, { headers: { Accept: 'application/json' } });
  } catch {
    throw new LookupError('geen verbinding');
  }
  if (!res.ok) throw new LookupError(`fout ${res.status}`);
  return res.json();
}

/** PDOK: alleen een treffer op adres-, straat- of postcodeniveau telt (geen plaats/gemeente: te grof). */
async function pdok(q: string): Promise<Point | null> {
  const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?rows=1&fl=centroide_ll,type&q=${encodeURIComponent(q)}`;
  const json = (await getJson(url)) as { response?: { docs?: { centroide_ll?: string; type?: string }[] } };
  const doc = json.response?.docs?.[0];
  if (!doc?.centroide_ll || !['adres', 'postcode', 'weg', 'hectometerpaal'].includes(doc.type ?? '')) return null;
  const m = doc.centroide_ll.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
  return m ? { lng: Number(m[1]), lat: Number(m[2]) } : null;
}

async function nominatim(q: string): Promise<Point | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=nl&q=${encodeURIComponent(q)}`;
  const list = (await getJson(url)) as { lat?: string; lon?: string }[];
  const lat = Number(list[0]?.lat);
  const lng = Number(list[0]?.lon);
  return list[0] && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/** Eén adres opzoeken: eerst PDOK, dan OpenStreetMap. null = nergens gevonden; LookupError = geen antwoord gekregen. */
async function lookup(q: string): Promise<Point | null> {
  let pdokFailed = false;
  try {
    const hit = await pdok(q);
    if (hit) return hit;
  } catch {
    pdokFailed = true;
  }
  try {
    return await nominatim(q);
  } catch (e) {
    // Beide bronnen gaven geen antwoord: als fout melden (niet als "niet gevonden"), dan wordt het later opnieuw geprobeerd.
    if (pdokFailed) throw e;
    return null;
  }
}

export interface GeocodeResult { found: number; notFound: string[]; failed: boolean }

let running: Promise<GeocodeResult> | null = null;

/**
 * Zoekt de ontbrekende punten op. Niet gevonden = geoFor bewaren zonder punt (niet elke keer opnieuw).
 * Een mislukt verzoek wordt één keer na 3 s herhaald; na drie mislukte adressen op rij stopt hij (rest volgt later).
 * Er loopt altijd maar één ronde tegelijk.
 */
export function geocodeMissing(ids: string[], onProgress?: (done: number, total: number) => void): Promise<GeocodeResult> {
  if (!running) running = run(ids, onProgress).finally(() => { running = null; });
  return running;
}

async function run(ids: string[], onProgress?: (done: number, total: number) => void): Promise<GeocodeResult> {
  const todo = (await db.items.bulkGet(ids)).filter((i): i is Item => !!i && needsGeocode(i));
  const result: GeocodeResult = { found: 0, notFound: [], failed: false };
  let failsInRow = 0;
  for (let n = 0; n < todo.length; n++) {
    const item = todo[n];
    const q = geoQuery(item);
    if (n > 0) await pause(1100); // netjes voor OpenStreetMap (max. 1 per seconde)
    let hit: Point | null | undefined;
    for (let attempt = 0; attempt < 2 && hit === undefined; attempt++) {
      try {
        hit = await lookup(q);
      } catch {
        if (attempt === 0) await pause(3000);
      }
    }
    onProgress?.(n + 1, todo.length);
    if (hit === undefined) {
      result.failed = true;
      if (++failsInRow >= 3) break;
      continue;
    }
    failsInRow = 0;
    const cur = await db.items.get(item.id);
    if (!cur || geoQuery(cur) !== q) continue; // adres intussen gewijzigd: volgende ronde
    await updateItem(item.id, (c) => {
      const fields: Item['fields'] = { ...c.fields, geoFor: q };
      if (hit) { fields.lat = Math.round(hit.lat * 1e6) / 1e6; fields.lng = Math.round(hit.lng * 1e6) / 1e6; }
      else { delete fields.lat; delete fields.lng; }
      return { fields };
    });
    if (hit) result.found++;
    else result.notFound.push(item.title);
  }
  return result;
}

/** Alle restaurants die nog een punt nodig hebben (voor het opzoeken op de achtergrond). */
export async function missingGeocodeIds(): Promise<string[]> {
  return (await db.items.where('type').equals('restaurant').toArray()).filter(needsGeocode).map((i) => i.id);
}
