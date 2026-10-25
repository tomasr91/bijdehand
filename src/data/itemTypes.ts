// Register van de tien soorten informatie. Eén plek voor labels, velden en weergave-hints.
// Een nieuwe soort toevoegen = hier een definitie toevoegen + TypeKey in model.ts + docs.
import type { FieldValue, Item, TypeKey } from './model';

export type FieldKind = 'text' | 'textarea' | 'number' | 'money' | 'date' | 'select' | 'rating' | 'boolean' | 'list' | 'url' | 'score';

export interface Option {
  value: string;
  label: string;
}

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  options?: Option[];
  placeholder?: string;
  /** Altijd zichtbaar; overige velden alleen als ze gevuld zijn of via "Meer velden". */
  primary?: boolean;
  hint?: string;
  /** Bij 'list': vaste suggesties om met één tik toe te voegen. */
  suggestions?: string[];
  /** Opgezochte gegevens van buiten (cijfers, prijsniveau…): apart getoond, en mogen door aanvullen worden ververst. */
  external?: boolean;
  /** Bij 'number': stapgrootte, bijv. 0.1 voor een cijfer als 4,7. */
  step?: number;
  /** Tijdelijk uit beeld: de waarde blijft bewaard (en in back-ups), maar de app toont het veld nergens. */
  hidden?: boolean;
}

/** Velden die de app toont (zonder `hidden`). */
export function shownFields(fields: FieldDef[]): FieldDef[] {
  return fields.filter((f) => !f.hidden);
}

export type GroupKey = 'inspiratie' | 'praktisch' | 'naslag';

export const GROUPS: { key: GroupKey; label: string; description: string }[] = [
  { key: 'inspiratie', label: 'Inspiratie', description: 'Wat ik wil doen, zien, lezen of geven' },
  { key: 'praktisch', label: 'Praktisch', description: 'Lijsten en klussen' },
  { key: 'naslag', label: 'Naslag', description: 'Gegevens om op te zoeken' },
];

export type IconName =
  | 'Gift' | 'BedDouble' | 'UtensilsCrossed' | 'BookOpen' | 'Disc3' | 'Shirt'
  | 'Gamepad2' | 'Backpack' | 'Wrench' | 'Sprout';

export interface TypeDef {
  key: TypeKey;
  label: string;
  plural: string;
  group: GroupKey;
  icon: IconName;
  titleLabel: string;
  titlePlaceholder: string;
  fields: FieldDef[];
  /** Veld met de status (voor filterchips en "nog open"). */
  statusKey?: string;
  /** Status die niet wordt opgeslagen maar uit andere velden volgt (restaurants: geweest = je gaf een cijfer).
   *  `words` = extra zoekwoorden per status. */
  derivedStatus?: { options: Option[]; of: (item: Item) => string; words?: Record<string, string> };
  /** Statuswaarden die als "afgerond" gelden. */
  doneStatuses?: string[];
  /** Checklist standaard tonen. */
  checklist?: boolean;
  /** Groepeer de verzamelingsweergave op dit veld. */
  groupBy?: string;
  /** Lijstveld waarop de verzameling extra filterchips toont (bijv. kenmerken). */
  filterKey?: string;
  /** Woorden die op deze soort wijzen (regelgebaseerde suggestie, geen AI). */
  keywords: string[];
  /** Websites die op deze soort wijzen. */
  hosts: string[];
  /** Sober detailscherm: alleen de hoofdvelden en "Mijn notities" (geen Claude-melding, opgezochte gegevens,
   *  extra velden, checklist, links, tags, geschiedenis of metadata). */
  compactDetail?: boolean;
}

const rating: FieldDef = { key: 'rating', label: 'Beoordeling', kind: 'rating' };

export const TYPES: TypeDef[] = [
  {
    key: 'gift', label: 'Cadeau', plural: 'Cadeaus', group: 'inspiratie', icon: 'Gift',
    titleLabel: 'Cadeau-idee', titlePlaceholder: 'Bijv. Pasta-cursus',
    fields: [
      { key: 'person', label: 'Voor wie', kind: 'text', primary: true, placeholder: 'Naam' },
      { key: 'occasion', label: 'Gelegenheid', kind: 'text', primary: true, placeholder: 'Verjaardag, Sinterklaas…' },
      { key: 'budget', label: 'Budget', kind: 'money', primary: true },
      { key: 'status', label: 'Status', kind: 'select', primary: true, options: [
        { value: 'idee', label: 'Idee' }, { value: 'gekocht', label: 'Gekocht' }, { value: 'gegeven', label: 'Gegeven' },
      ] },
    ],
    statusKey: 'status', doneStatuses: ['gegeven'], groupBy: 'person',
    keywords: ['cadeau', 'cadeautje', 'kado', 'kadootje', 'verjaardag', 'sinterklaas', 'kerst', 'geven aan', 'surprise'],
    hosts: [],
  },
  {
    key: 'trip', label: 'Nachtje weg', plural: 'Nachtjes weg', group: 'inspiratie', icon: 'BedDouble',
    titleLabel: 'Naam', titlePlaceholder: 'Bijv. Weekend Gent',
    fields: [
      { key: 'destination', label: 'Bestemming', kind: 'text', primary: true, placeholder: 'Plaats of regio' },
      { key: 'accommodation', label: 'Accommodatie', kind: 'text', primary: true },
      { key: 'price', label: 'Prijsindicatie', kind: 'text', placeholder: 'Bijv. € 120 per nacht' },
      { key: 'reasons', label: 'Waarom hierheen', kind: 'textarea' },
      { key: 'status', label: 'Status', kind: 'select', primary: true, options: [
        { value: 'idee', label: 'Idee' }, { value: 'gepland', label: 'Gepland' }, { value: 'geweest', label: 'Geweest' },
      ] },
    ],
    statusKey: 'status', doneStatuses: ['geweest'],
    keywords: ['hotel', 'b&b', 'bed and breakfast', 'overnachten', 'nachtje', 'weekendje', 'weekend weg', 'vakantiehuis', 'huisje', 'camping', 'glamping'],
    hosts: ['booking.com', 'airbnb.', 'natuurhuisje.nl', 'hotels.com', 'expedia.', 'vrbo.com'],
  },
  {
    key: 'restaurant', label: 'Restaurant', plural: 'Restaurants', group: 'inspiratie', icon: 'UtensilsCrossed',
    titleLabel: 'Naam', titlePlaceholder: 'Naam van het restaurant',
    fields: [
      { key: 'city', label: 'Plaats', kind: 'text', primary: true, placeholder: 'Bijv. Utrecht' },
      { key: 'cuisine', label: 'Keuken', kind: 'text', primary: true, placeholder: 'Bijv. Afghaans, Italiaans' },
      // Wat voor zaak het is (verwachting): in de app alleen zichtbaar als label "Fine dining" (de andere waarden blijven bewaard). Claude vult dit in bij het opzoeken.
      { key: 'venue', label: 'Soort zaak', kind: 'select', primary: true, options: [
        { value: 'finedining', label: 'Fine dining' }, { value: 'restaurant', label: 'Restaurant' },
        { value: 'bistro', label: 'Bistro / eetcafé' }, { value: 'casual', label: 'Snel & casual' },
      ] },
      { key: 'experience', label: 'Beleving', kind: 'boolean', hint: 'Show, pop-up, verrassingsmenu of iets anders bijzonders' },
      { key: 'traits', label: 'Labels', kind: 'list', primary: true, hint: 'Wat maakt het bijzonder?',
        suggestions: ['vegetarisch', 'veganistisch', 'fancy', 'kleine gerechten', 'reserveren', 'terras', 'betaalbaar', 'afhalen'] },
      { key: 'score', label: 'Mijn cijfer', kind: 'score', primary: true, placeholder: 'Bijv. 7,5', hint: '1 tot 10; leeg = nog niet geweest' },
      { key: 'favorite', label: 'Favoriet', kind: 'boolean', primary: true },
      // Uit schema v3 ("geweest" zonder cijfer); niet zelf in te stellen, telt wel als geweest.
      { key: 'visited', label: 'Geweest (zonder cijfer)', kind: 'boolean', hidden: true },
      { key: 'address', label: 'Adres of buurt', kind: 'text', primary: true, placeholder: 'Straat + huisnummer, of buurt' },
      { key: 'dishes', label: 'Favoriete gerechten', kind: 'textarea' },
      // Opgezocht (door Claude of zelf), met bron en datum. Eigen beoordeling staat hierboven, los hiervan.
      { key: 'summary', label: 'Samenvatting', kind: 'textarea', external: true, hint: 'Korte beschrijving; staat bovenaan het restaurant' },
      { key: 'website', label: 'Website', kind: 'url', external: true, placeholder: 'https://…' },
      // Cijfers en prijsniveau: op verzoek van de eigenaar tijdelijk verborgen (komen later terug, zie ROADMAP).
      { key: 'priceLevel', label: 'Prijsniveau', kind: 'select', external: true, hidden: true, options: [
        { value: '€', label: '€' }, { value: '€€', label: '€€' }, { value: '€€€', label: '€€€' }, { value: '€€€€', label: '€€€€' },
      ] },
      { key: 'googleRating', label: 'Google-cijfer (van 5)', kind: 'number', external: true, hidden: true, step: 0.1 },
      { key: 'googleCount', label: 'Aantal Google-beoordelingen', kind: 'number', external: true, hidden: true },
      { key: 'theforkRating', label: 'TheFork-cijfer (van 10)', kind: 'number', external: true, hidden: true, step: 0.1 },
      { key: 'theforkCount', label: 'Aantal TheFork-beoordelingen', kind: 'number', external: true, hidden: true },
      { key: 'tripadvisorRating', label: 'Tripadvisor-cijfer (van 5)', kind: 'number', external: true, hidden: true, step: 0.1 },
      { key: 'tripadvisorCount', label: 'Aantal Tripadvisor-beoordelingen', kind: 'number', external: true, hidden: true },
      { key: 'michelin', label: 'Michelin', kind: 'text', external: true, placeholder: 'Bijv. vermeld in de gids, groene ster' },
      { key: 'openStatus', label: 'Status zaak', kind: 'select', external: true, options: [
        { value: 'open', label: 'Open' }, { value: 'tijdelijk', label: 'Tijdelijk dicht' }, { value: 'gesloten', label: 'Permanent gesloten' },
      ] },
      { key: 'checkedAt', label: 'Opgezocht op', kind: 'date', external: true },
      { key: 'ratingSource', label: 'Bron van de cijfers', kind: 'text', external: true, hidden: true },
      { key: 'uncertain', label: 'Nog onzeker', kind: 'textarea', external: true },
      // Locatie voor de kaart, door de app opgezocht uit het adres (OpenStreetMap). geoFor = het adres waarvoor
      // gezocht is; verandert het adres, dan zoekt de app opnieuw. geoFor zonder lat/lng = niet gevonden.
      { key: 'lat', label: 'Breedtegraad', kind: 'number', external: true, hidden: true },
      { key: 'lng', label: 'Lengtegraad', kind: 'number', external: true, hidden: true },
      { key: 'geoFor', label: 'Locatie gezocht voor', kind: 'text', external: true, hidden: true },
    ],
    derivedStatus: {
      options: [{ value: 'niet', label: 'Nog niet geweest' }, { value: 'geweest', label: 'Geweest' }],
      of: (i) => (hasBeen(i) ? 'geweest' : 'niet'),
      words: { niet: 'nog niet geweest proberen', geweest: 'geweest bezocht' },
    },
    groupBy: 'city', filterKey: 'traits', compactDetail: true,
    keywords: ['restaurant', 'eten bij', 'uit eten', 'diner', 'lunch', 'bistro', 'brasserie', 'eetcafe', 'eetcafé', 'pizzeria', 'sushi', 'ramen'],
    hosts: ['thefork.', 'iens.nl', 'tripadvisor.', 'michelin.'],
  },
  {
    key: 'book', label: 'Boek', plural: 'Boeken', group: 'inspiratie', icon: 'BookOpen',
    titleLabel: 'Titel', titlePlaceholder: 'Titel van het boek',
    fields: [
      { key: 'author', label: 'Auteur', kind: 'text', primary: true },
      { key: 'status', label: 'Status', kind: 'select', primary: true, options: [
        { value: 'wil', label: 'Wil lezen' }, { value: 'bezig', label: 'Aan het lezen' }, { value: 'gelezen', label: 'Gelezen' },
      ] },
      { ...rating, primary: true },
    ],
    statusKey: 'status', doneStatuses: ['gelezen'],
    keywords: ['boek', 'roman', 'lezen', 'auteur', 'schrijver', 'leesboek', 'thriller'],
    hosts: ['goodreads.com', 'bol.com/nl/nl/p', 'boekenwereld', 'storytel.'],
  },
  {
    key: 'album', label: 'Album', plural: 'Albums', group: 'inspiratie', icon: 'Disc3',
    titleLabel: 'Album', titlePlaceholder: 'Naam van het album',
    fields: [
      { key: 'artist', label: 'Artiest', kind: 'text', primary: true },
      { key: 'status', label: 'Status', kind: 'select', primary: true, options: [
        { value: 'ontdekken', label: 'Ontdekken' }, { value: 'luisteren', label: 'Beluisteren' },
        { value: 'opnieuw', label: 'Opnieuw beluisteren' }, { value: 'geluisterd', label: 'Geluisterd' },
      ] },
      rating,
    ],
    statusKey: 'status', doneStatuses: ['geluisterd'],
    keywords: ['album', 'plaat', 'lp', 'vinyl', 'muziek', 'artiest', 'band', 'luisteren'],
    hosts: ['open.spotify.com/album', 'music.apple.com', 'bandcamp.com', 'discogs.com'],
  },
  {
    key: 'size', label: 'Kleermaat', plural: 'Kleermaten', group: 'naslag', icon: 'Shirt',
    titleLabel: 'Omschrijving', titlePlaceholder: 'Bijv. Spijkerbroek',
    fields: [
      { key: 'person', label: 'Persoon', kind: 'text', primary: true, placeholder: 'Naam' },
      { key: 'garment', label: 'Kledingtype', kind: 'text', primary: true, placeholder: 'Broek, schoenen, jas…' },
      { key: 'size', label: 'Maat', kind: 'text', primary: true, placeholder: 'Bijv. 32/34, M, 43' },
      { key: 'brand', label: 'Merk', kind: 'text', primary: true },
      { key: 'date', label: 'Datum', kind: 'date', primary: true, hint: 'Wanneer gemeten of gekocht' },
    ],
    groupBy: 'person',
    keywords: ['maat', 'kledingmaat', 'schoenmaat', 'confectiemaat', 'broekmaat', 'maten'],
    hosts: [],
  },
  {
    key: 'game', label: 'Game', plural: 'Games', group: 'inspiratie', icon: 'Gamepad2',
    titleLabel: 'Titel', titlePlaceholder: 'Naam van de game',
    fields: [
      { key: 'platform', label: 'Platform', kind: 'text', primary: true, placeholder: 'Switch, PS5, pc…' },
      { key: 'status', label: 'Status', kind: 'select', primary: true, options: [
        { value: 'verlanglijst', label: 'Verlanglijst' }, { value: 'spelen', label: 'Aan het spelen' }, { value: 'uitgespeeld', label: 'Uitgespeeld' },
      ] },
      rating,
    ],
    statusKey: 'status', doneStatuses: ['uitgespeeld'],
    keywords: ['game', 'spel spelen', 'switch', 'playstation', 'ps5', 'xbox', 'steam', 'gamen'],
    hosts: ['store.steampowered.com', 'nintendo.com', 'playstation.com', 'xbox.com', 'gog.com'],
  },
  {
    key: 'packing', label: 'Paklijst', plural: 'Paklijsten', group: 'praktisch', icon: 'Backpack',
    titleLabel: 'Naam', titlePlaceholder: 'Bijv. Basislijst weekend',
    fields: [
      { key: 'isTemplate', label: 'Herbruikbare basislijst', kind: 'boolean', primary: true, hint: 'Kopieer een basislijst per reis' },
      { key: 'tripDate', label: 'Vertrekdatum', kind: 'date' },
    ],
    checklist: true,
    keywords: ['paklijst', 'inpakken', 'meenemen', 'mee nemen', 'koffer', 'tas inpakken'],
    hosts: [],
  },
  {
    key: 'todo', label: 'Klus', plural: "Klussen en to-do's", group: 'praktisch', icon: 'Wrench',
    titleLabel: 'Wat moet er gebeuren', titlePlaceholder: 'Bijv. Lekkende kraan maken',
    fields: [
      { key: 'status', label: 'Status', kind: 'select', primary: true, options: [
        { value: 'open', label: 'Te doen' }, { value: 'bezig', label: 'Bezig' }, { value: 'klaar', label: 'Klaar' },
      ] },
      { key: 'priority', label: 'Prioriteit', kind: 'select', primary: true, options: [
        { value: 'laag', label: 'Laag' }, { value: 'normaal', label: 'Normaal' }, { value: 'hoog', label: 'Hoog' },
      ] },
      { key: 'due', label: 'Deadline', kind: 'date', primary: true },
      { key: 'materials', label: 'Benodigde materialen', kind: 'textarea', placeholder: 'Eén per regel' },
    ],
    statusKey: 'status', doneStatuses: ['klaar'],
    keywords: ['klus', 'klusje', 'repareren', 'maken', 'ophangen', 'schilderen', 'vervangen', 'regelen', 'to-do', 'todo', 'moet nog', 'bellen', 'opruimen'],
    hosts: [],
  },
  {
    key: 'plant', label: 'Plant', plural: 'Plantenonderhoud', group: 'naslag', icon: 'Sprout',
    titleLabel: 'Naam', titlePlaceholder: 'Bijv. Monstera',
    fields: [
      { key: 'location', label: 'Locatie', kind: 'text', primary: true, placeholder: 'Woonkamer, balkon…' },
      { key: 'care', label: 'Verzorging', kind: 'textarea', primary: true, placeholder: 'Water, licht, voeding…' },
      { key: 'intervalDays', label: 'Verzorgen elke … dagen', kind: 'number', primary: true },
      { key: 'nextCare', label: 'Volgende verzorging', kind: 'date', primary: true },
      { key: 'lastCare', label: 'Laatst verzorgd', kind: 'date' },
    ],
    keywords: ['plant', 'planten', 'water geven', 'potgrond', 'verpotten', 'stekje', 'monstera', 'ficus', 'cactus', 'vetplant'],
    hosts: [],
  },
];

export const TYPE_MAP: Record<TypeKey, TypeDef> = Object.fromEntries(TYPES.map((t) => [t.key, t])) as Record<TypeKey, TypeDef>;

export function typeDef(key: TypeKey | null | undefined): TypeDef | undefined {
  return key ? TYPE_MAP[key] : undefined;
}

export function isTypeKey(v: unknown): v is TypeKey {
  return typeof v === 'string' && v in TYPE_MAP;
}

export function fieldDef(type: TypeKey, key: string): FieldDef | undefined {
  return TYPE_MAP[type].fields.find((f) => f.key === key);
}

export function optionLabel(type: TypeKey, key: string, value: FieldValue): string {
  const def = fieldDef(type, key);
  if (!def?.options || typeof value !== 'string') return value == null ? '' : String(value);
  return def.options.find((o) => o.value === value)?.label ?? value;
}

/** Restaurant: geweest als je een cijfer gaf (of het oude "geweest" zonder cijfer). */
export function hasBeen(item: Item): boolean {
  return typeof item.fields.score === 'number' || item.fields.visited === true;
}

/** Statuskeuzes voor filters: opgeslagen statusveld of afgeleide status. */
export function statusOptions(def: TypeDef | undefined): Option[] {
  if (!def) return [];
  if (def.derivedStatus) return def.derivedStatus.options;
  return def.statusKey ? def.fields.find((f) => f.key === def.statusKey)?.options ?? [] : [];
}

export function statusOf(item: Item): string | undefined {
  const def = typeDef(item.type);
  if (def?.derivedStatus) return def.derivedStatus.of(item);
  if (!def?.statusKey) return undefined;
  const v = item.fields[def.statusKey];
  return typeof v === 'string' && v ? v : undefined;
}

export function isDone(item: Item): boolean {
  const def = typeDef(item.type);
  const s = statusOf(item);
  return !!(def?.doneStatuses && s && def.doneStatuses.includes(s));
}

/** Standaardwaarden bij het aanmaken van een item van deze soort. */
export function defaultFields(type: TypeKey): Record<string, FieldValue> {
  const def = TYPE_MAP[type];
  const out: Record<string, FieldValue> = {};
  if (def.statusKey) {
    const f = def.fields.find((x) => x.key === def.statusKey);
    if (f?.options?.[0]) out[def.statusKey] = f.options[0].value;
  }
  if (type === 'todo') out.priority = 'normaal';
  return out;
}
