// Kleine set realistische voorbeeldgegevens. Alleen op verzoek geladen (Instellingen),
// gemarkeerd met origin.system = 'sample' zodat ze weer verwijderd kunnen worden.
import { db } from './db';
import type { FieldValue, Item, Link, Origin, Source, TypeKey } from './model';
import { buildItem, buildSource, entry } from './repo';
import { addDays, localDate, newId, nowIso } from './util';

interface S {
  type: TypeKey | null;
  title: string;
  body?: string;
  fields?: Record<string, FieldValue>;
  list?: (string | [string, boolean])[];
  tags?: string[];
  url?: string;
  urlTitle?: string;
  urlNote?: string;
}

export function sampleSpecs(today = localDate()): S[] {
  const d = (n: number) => addDays(today, n);
  return [
    { type: 'gift', title: 'Pasta-cursus voor twee', fields: { person: 'Partner', occasion: 'Verjaardag', budget: 90, status: 'idee' }, url: 'https://www.example.com/pasta-workshop', urlTitle: 'Pasta-workshop – Example Kookstudio', urlNote: 'Zaterdagochtend, ook vegetarisch' },
    { type: 'gift', title: 'Kaarsenpakket bijenwas', fields: { person: 'Moeder', occasion: 'Moederdag', budget: 35, status: 'idee' } },
    { type: 'gift', title: 'Lego Botanicals bonsai', fields: { person: 'Partner', occasion: 'Sinterklaas', budget: 50, status: 'gekocht' }, tags: ['verstoppen'] },
    { type: 'trip', title: 'Weekend Gent', fields: { destination: 'Gent, België', accommodation: 'Klein hotel bij de Graslei', price: '± € 140 per nacht', reasons: 'Mooie binnenstad, goed met de trein, veel vegetarisch eten', status: 'idee' }, url: 'https://www.example.com/hotel-graslei', urlTitle: 'Hotel aan de Graslei', urlNote: 'Kamer met uitzicht op het water vragen' },
    { type: 'trip', title: 'Boshuisje Veluwe', fields: { destination: 'Veluwe', accommodation: 'Boshuisje met houtkachel', price: '€ 95–120 per nacht', status: 'gepland' }, body: 'Wandelroute Posbank meenemen.' },
    { type: 'restaurant', title: 'Bar Basiliek', fields: { city: 'Utrecht', traits: ['kleine gerechten'] }, body: 'Getipt door collega: kleine gerechten om te delen.' },
    { type: 'restaurant', title: 'Trattoria Da Marco', fields: { city: 'Zwolle', cuisine: 'Italiaans', favorite: true, score: 8.5, traits: ['reserveren'], dishes: 'Cacio e pepe\nTiramisu' } },
    { type: 'restaurant', title: 'Pho Hanoi', fields: { city: 'Amsterdam', cuisine: 'Vietnamees', address: 'Oost', score: 6.5, traits: ['betaalbaar'], dishes: 'Pho bo' }, body: 'Lekker, maar erg druk op vrijdag.' },
    { type: 'book', title: 'De avond is ongemak', fields: { author: 'Marieke Lucas Rijneveld', status: 'gelezen', rating: 4 } },
    { type: 'book', title: 'Project Hail Mary', fields: { author: 'Andy Weir', status: 'wil' } },
    { type: 'book', title: 'Tsjernobyl-gebed', fields: { author: 'Svetlana Alexijevitsj', status: 'bezig' } },
    { type: 'album', title: 'Blue', fields: { artist: 'Joni Mitchell', status: 'opnieuw' } },
    { type: 'album', title: 'In Rainbows', fields: { artist: 'Radiohead', status: 'ontdekken' } },
    { type: 'size', title: 'Spijkerbroek', fields: { person: 'Ik', garment: 'Broek', size: '32/34', brand: "Levi's 511", date: d(-120) } },
    { type: 'size', title: 'Hardloopschoenen', fields: { person: 'Ik', garment: 'Schoenen', size: '43', brand: 'Asics', date: d(-30) }, body: 'Valt klein, halve maat groter bestellen.' },
    { type: 'size', title: 'Winterjas', fields: { person: 'Partner', garment: 'Jas', size: 'M', brand: 'Patagonia', date: d(-300) } },
    { type: 'game', title: 'Zelda: Tears of the Kingdom', fields: { platform: 'Switch', status: 'spelen' } },
    { type: 'game', title: 'Hades II', fields: { platform: 'pc', status: 'verlanglijst' } },
    { type: 'game', title: 'Stardew Valley', fields: { platform: 'Switch', status: 'uitgespeeld', rating: 5 } },
    { type: 'packing', title: 'Basislijst weekend weg', fields: { isTemplate: true }, list: ['Telefoonoplader', 'Tandenborstel', 'Medicijnen', 'Pyjama', 'Ondergoed en sokken', 'Leesboek', 'Regenjas'] },
    { type: 'packing', title: 'Weekend Gent', fields: { isTemplate: false, tripDate: d(12) }, list: [['Telefoonoplader', true], ['Tandenborstel', false], ['Medicijnen', false], ['Treinkaartjes printen', false]] },
    { type: 'todo', title: 'Lekkende kraan badkamer', fields: { status: 'open', priority: 'hoog', due: d(-1), materials: 'Kraanleertjes 1/2"\nWaterpomptang' } },
    { type: 'todo', title: 'Fietsverlichting vervangen', fields: { status: 'open', priority: 'normaal', due: d(3), materials: 'Achterlicht met batterij' } },
    { type: 'todo', title: 'Schilderijen ophangen gang', fields: { status: 'bezig', priority: 'laag' } },
    { type: 'plant', title: 'Monstera', fields: { location: 'Woonkamer', care: 'Water als de bovenste 3 cm droog is. Geen direct zonlicht.', intervalDays: 7, nextCare: d(0), lastCare: d(-7) } },
    { type: 'plant', title: 'Olijfboompje', fields: { location: 'Balkon', care: 'Zon, weinig water. Bij vorst naar binnen.', intervalDays: 14, nextCare: d(5) } },
    { type: null, title: 'Restaurant met dat terras aan de Vecht', body: 'Naam vergeten, staat bij de brug in Maarssen' },
    { type: null, title: 'Boodschappen', list: ['Havermout', 'Bananen', 'Koffiebonen'] },
  ];
}

export async function loadSampleData(): Promise<number> {
  const origin: Origin = { system: 'sample', at: nowIso() };
  const items: Item[] = [];
  const sources: Source[] = [];
  const links: Link[] = [];
  const specs = sampleSpecs();
  // Oplopende aanmaaktijden, zodat "Recent" een logische volgorde heeft.
  const base = Date.now() - specs.length * 3600_000;
  specs.forEach((s, i) => {
    const item = buildItem({ type: s.type, title: s.title, body: s.body, fields: s.fields, tags: s.tags, origin });
    item.checklist = (s.list ?? []).map((x) => (Array.isArray(x) ? entry(x[0], x[1]) : entry(x)));
    item.createdAt = item.updatedAt = new Date(base + i * 3600_000).toISOString();
    items.push(item);
    if (s.url) {
      const src = buildSource({ url: s.url, title: s.urlTitle, note: s.urlNote, infoVia: 'voorbeeld', origin });
      sources.push(src);
      links.push({ id: newId(), aKind: 'item', aId: item.id, bKind: 'source', bId: src.id, createdAt: item.createdAt, updatedAt: item.createdAt, deletedAt: null });
    }
  });
  await db.transaction('rw', db.items, db.sources, db.links, async () => {
    await db.items.bulkAdd(items);
    await db.sources.bulkAdd(sources);
    await db.links.bulkAdd(links);
  });
  return items.length;
}

/** Verwijdert voorbeeldgegevens die niet zijn aangepast. Aangepaste blijven bewaard. */
export async function removeSampleData(): Promise<{ removed: number; kept: number }> {
  return db.transaction('rw', db.items, db.sources, db.links, db.revisions, async () => {
    const items = (await db.items.toArray()).filter((i) => i.origin?.system === 'sample');
    const sources = (await db.sources.toArray()).filter((s) => s.origin?.system === 'sample');
    const remove = [...items.filter((i) => i.rev === 1), ...sources.filter((s) => s.rev === 1)].map((r) => r.id);
    const removeSet = new Set(remove);
    await db.items.bulkDelete(remove);
    await db.sources.bulkDelete(remove);
    const links = (await db.links.toArray()).filter((l) => removeSet.has(l.aId) || removeSet.has(l.bId));
    await db.links.bulkDelete(links.map((l) => l.id));
    return { removed: remove.length, kept: items.length + sources.length - remove.length };
  });
}
