// Testgegevens (verzonnen): alleen voor unit- en e2e-tests, niet in de app.
// Gemarkeerd met origin.system = 'sample'.
import { APP_VERSION, BACKUP_FORMAT, BACKUP_FORMAT_VERSION, type Backup } from './backup';
import { db } from './db';
import { SCHEMA_VERSION, type FieldValue, type Item, type Link, type Origin, type Source, type TypeKey } from './model';
import { buildItem, buildSource, entry } from './repo';
import { newId, nowIso } from './util';

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

export function sampleSpecs(): S[] {
  return [
    { type: 'restaurant', title: 'Bar Basiliek', fields: { city: 'Utrecht', traits: ['kleine gerechten'] }, body: 'Getipt door collega: kleine gerechten om te delen.' },
    { type: 'restaurant', title: 'Trattoria Da Marco', fields: { city: 'Zwolle', cuisine: 'Italiaans', favorite: true, score: 8.5, traits: ['italiaans'], dishes: 'Cacio e pepe\nTiramisu' } },
    { type: 'restaurant', title: 'Pho Hanoi', fields: { city: 'Amsterdam', cuisine: 'Vietnamees', address: 'Oost', score: 6.5, traits: ['vietnamees'], dishes: 'Pho bo' }, body: 'Lekker, maar erg druk op vrijdag.' },
    { type: 'restaurant', title: 'Het Groene Bord', fields: { city: 'Utrecht', venue: 'finedining', traits: ['seizoensgebonden', 'vegetarisch', 'set menu'] }, url: 'https://www.example.com/groene-bord', urlTitle: 'Het Groene Bord', urlNote: 'Menu wisselt elke maand' },
    { type: 'restaurant', title: 'Eetcafé De Graslei', fields: { city: 'Gent', traits: ['eetcafé', 'van alles'], score: 7 } },
    { type: 'activity', title: 'Kinderboerderij De Ooievaar', fields: { city: 'Utrecht', traits: ['dieren', 'buiten', 'gratis'] } },
    { type: 'date', title: 'Wijnproeverij De Kelder', fields: { city: 'Amersfoort', traits: ['eten en drinken', 'avond'], score: 8 } },
    { type: 'conference', title: 'DataFest Utrecht', fields: { startDate: '2027-03-12', city: 'Utrecht', status: 'interessant', traits: ['data', 'ai'] } },
    { type: 'clothing', title: 'Bergvos', fields: { sizes: ['broek M', 'trui L'] } },
    { type: 'album', title: 'Blue', fields: { artist: 'Joni Mitchell', status: 'opnieuw' } },
    { type: 'album', title: 'In Rainbows', fields: { artist: 'Radiohead', status: 'ontdekken' } },
    { type: 'album', title: 'Kind of Blue', fields: { artist: 'Miles Davis', status: 'geluisterd', rating: 5 } },
    { type: 'album', title: 'Hounds of Love', fields: { artist: 'Kate Bush', status: 'luisteren' } },
    { type: 'packing', title: 'Vakantie', list: [['Telefoonoplader', true], 'Tandenborstel', 'Medicijnen', 'Paspoorten', 'Zonnebrand', 'Regenjas', 'Leesboek'] },
    { type: null, title: 'Restaurant met dat terras aan de Vecht', body: 'Naam vergeten, staat bij de brug in Maarssen' },
    { type: null, title: 'Boodschappen', list: ['Havermout', 'Bananen', 'Koffiebonen'] },
  ];
}


/** Alle testgegevens als losse records (zonder database). */
export function sampleRecords(): { items: Item[]; sources: Source[]; links: Link[] } {
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
  return { items, sources, links };
}

/** Testgegevens als back-upbestand (voor de e2e-tests: terugzetten via Instellingen). */
export function sampleBackup(): Backup {
  const { items, sources, links } = sampleRecords();
  return {
    format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, schemaVersion: SCHEMA_VERSION, exportedAt: nowIso(), appVersion: APP_VERSION,
    counts: { items: items.length, sources: sources.length, links: links.length, revisions: 0 },
    data: { items, sources, links, revisions: [] },
  };
}

/** Testgegevens in de database zetten (unit-tests). */
export async function loadSampleData(): Promise<number> {
  const { items, sources, links } = sampleRecords();
  await db.transaction('rw', db.items, db.sources, db.links, async () => {
    await db.items.bulkAdd(items);
    await db.sources.bulkAdd(sources);
    await db.links.bulkAdd(links);
  });
  return items.length;
}
