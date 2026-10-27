// Register van de soorten informatie (restaurants, uitjes met kinderen, dates, albums, paklijst). Eén plek voor labels, velden en weergave-hints.
// Ongebruikte soorten zijn verwijderd (D25); oude items daarvan gaan bij de migratie naar de Inbox (migrate.ts).
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

export type GroupKey = 'inspiratie' | 'praktisch';

export const GROUPS: { key: GroupKey; label: string; description: string }[] = [
  { key: 'inspiratie', label: 'Inspiratie', description: 'Waar ik wil eten, naartoe wil en wat ik wil luisteren' },
  { key: 'praktisch', label: 'Praktisch', description: 'Lijsten en congressen' },
];

export type IconName = 'UtensilsCrossed' | 'Tent' | 'Wine' | 'Presentation' | 'Disc3' | 'Backpack';

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
  /** Filter in de verzameling: [nog niet afgerond, afgerond], bijv. ['Nog luisteren', 'Geluisterd']. */
  filterLabels?: [string, string];
  /** Alleen titel, checklist en notities in het detailscherm (geen links, tags, geschiedenis). */
  simpleDetail?: boolean;
  /** Plek-soort (restaurant, uitje, date): lijst per plaats, kaart, cijfer/hartje, sober detailscherm met route. */
  place?: boolean;
  /** Teksten voor een plek-soort. */
  placeTexts?: { noun: string; emptyTitle: string; emptySub: string; pasteExample: string; notesPlaceholder: string };
}

const rating: FieldDef = { key: 'rating', label: 'Beoordeling', kind: 'rating' };

/** Verwijderde soorten (D25): alleen nog nodig om oude gegevens netjes naar de Inbox te zetten. */
export const LEGACY_TYPES: Record<string, string> = {
  gift: 'Cadeau', trip: 'Nachtje weg', book: 'Boek', size: 'Kleermaat', game: 'Game', todo: 'Klus', plant: 'Plant',
};

/** Velden van een uitje of date: dezelfde basis als een restaurant (plaats, labels, cijfer, adres, opgezochte gegevens, kaartpunt). */
function placeFields(labelHint: string, suggestions: string[], placeholder: string): FieldDef[] {
  return [
    { key: 'city', label: 'Plaats', kind: 'text', primary: true, placeholder: 'Bijv. Utrecht' },
    { key: 'traits', label: 'Labels', kind: 'list', primary: true, hint: labelHint, suggestions },
    { key: 'score', label: 'Mijn cijfer', kind: 'score', primary: true, placeholder: 'Bijv. 7,5', hint: '1 tot 10; leeg = nog niet geweest' },
    { key: 'favorite', label: 'Favoriet', kind: 'boolean', primary: true },
    { key: 'visited', label: 'Geweest (zonder cijfer)', kind: 'boolean', hidden: true },
    { key: 'address', label: 'Adres of buurt', kind: 'text', primary: true, placeholder },
    { key: 'summary', label: 'Samenvatting', kind: 'textarea', external: true, hint: 'Korte beschrijving; staat bovenaan' },
    { key: 'website', label: 'Website', kind: 'url', external: true, placeholder: 'https://…' },
    { key: 'openStatus', label: 'Status', kind: 'select', external: true, options: [
      { value: 'open', label: 'Open' }, { value: 'tijdelijk', label: 'Tijdelijk dicht' }, { value: 'gesloten', label: 'Permanent gesloten' },
    ] },
    { key: 'checkedAt', label: 'Opgezocht op', kind: 'date', external: true },
    { key: 'uncertain', label: 'Nog onzeker', kind: 'textarea', external: true },
    { key: 'lat', label: 'Breedtegraad', kind: 'number', external: true, hidden: true },
    { key: 'lng', label: 'Lengtegraad', kind: 'number', external: true, hidden: true },
    { key: 'geoFor', label: 'Locatie gezocht voor', kind: 'text', external: true, hidden: true },
  ];
}

const placeStatus: Pick<TypeDef, 'derivedStatus' | 'groupBy' | 'filterKey' | 'compactDetail' | 'place'> = {
  derivedStatus: {
    options: [{ value: 'niet', label: 'Nog niet geweest' }, { value: 'geweest', label: 'Geweest' }],
    of: (i) => (hasBeen(i) ? 'geweest' : 'niet'),
    words: { niet: 'nog niet geweest proberen', geweest: 'geweest bezocht' },
  },
  groupBy: 'city', filterKey: 'traits', compactDetail: true, place: true,
};

export const TYPES: TypeDef[] = [


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
      { key: 'traits', label: 'Labels', kind: 'list', primary: true, hint: 'Wat kun je verwachten? De eerste drie staan op het kaartje.',
        suggestions: ['eetcafé', 'van alles', 'set menu', 'verrassingsmenu', 'shared dining', 'vegetarisch', 'veganistisch', 'vega-opties'] },
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
    place: true,
    placeTexts: {
      noun: 'restaurant', emptyTitle: 'Nog geen restaurants', emptySub: 'Waar wil je nog eten?',
      pasteExample: 'Eén per regel, bijv.\nLeiden - Pamir (Afghaans)\nZwolle - Het hoekje (kleine gerechtjes, reserveren)',
      notesPlaceholder: 'Wat at je, met wie, wat wil je onthouden?',
    },
  },

  {
    key: 'activity', label: 'Uitje', plural: 'Uitjes', group: 'inspiratie', icon: 'Tent',
    titleLabel: 'Naam', titlePlaceholder: 'Naam van het uitje',
    fields: placeFields(
      'Wat kun je verwachten? De eerste drie staan op het kaartje.',
      ['binnen', 'buiten', 'dieren', 'speeltuin', 'natuur', 'museum', 'zwemmen', 'regenproof', 'gratis'],
      'Straat + huisnummer, of buurt',
    ),
    ...placeStatus,
    keywords: ['uitje', 'uitjes', 'met kinderen', 'met de kinderen', 'kindvriendelijk', 'speeltuin', 'dierentuin', 'pretpark', 'kinderboerderij', 'speelparadijs'],
    hosts: [],
    placeTexts: {
      noun: 'uitje', emptyTitle: 'Nog geen uitjes', emptySub: 'Wat ga je met de kinderen doen?',
      pasteExample: 'Eén per regel, bijv.\nUtrecht - Kinderboerderij Nieuw Zuid (dieren, buiten)\nAmsterdam - NEMO (museum, binnen)',
      notesPlaceholder: 'Wat was leuk, hoe oud waren de kinderen, wat wil je onthouden?',
    },
  },

  {
    key: 'date', label: 'Date', plural: 'Dates', group: 'inspiratie', icon: 'Wine',
    titleLabel: 'Naam', titlePlaceholder: 'Naam van de date',
    fields: placeFields(
      'Wat kun je verwachten? De eerste drie staan op het kaartje.',
      ['romantisch', 'actief', 'cultuur', 'eten en drinken', 'buiten', 'binnen', 'avond', 'thuis', 'verrassend'],
      'Straat + huisnummer, of buurt (leeg bij een date thuis)',
    ),
    ...placeStatus,
    keywords: ['date', 'dates', 'date night', 'datenight', 'romantisch', 'romantische', 'samen met', 'met z\'n tweeën', 'met zn tweeen', 'avondje uit'],
    hosts: [],
    placeTexts: {
      noun: 'date', emptyTitle: 'Nog geen dates', emptySub: 'Wat ga je samen doen?',
      pasteExample: 'Eén per regel, bijv.\nUtrecht - Wijnproeverij (eten en drinken, avond)\nAmersfoort - Klimbos (actief, buiten)',
      notesPlaceholder: 'Wat was leuk, wat wil je onthouden?',
    },
  },

  {
    key: 'conference', label: 'Congres', plural: 'Congressen', group: 'praktisch', icon: 'Presentation',
    titleLabel: 'Naam', titlePlaceholder: 'Naam van het congres',
    // Kaal (D27): naam, datum, plaats, link. De overige velden blijven verborgen bewaard (ook in back-ups).
    fields: [
      { key: 'startDate', label: 'Datum', kind: 'date', primary: true },
      { key: 'city', label: 'Plaats', kind: 'text', primary: true, placeholder: 'Bijv. Utrecht, of Online' },
      { key: 'website', label: 'Link', kind: 'url', primary: true, placeholder: 'https://…' },
      { key: 'endDate', label: 'Einddatum', kind: 'date', hidden: true },
      { key: 'status', label: 'Status', kind: 'select', hidden: true, options: [
        { value: 'interessant', label: 'Interessant' }, { value: 'gaat', label: 'Ik ga' }, { value: 'geweest', label: 'Geweest' },
      ] },
      { key: 'traits', label: 'Labels', kind: 'list', hidden: true },
      { key: 'summary', label: 'Samenvatting', kind: 'textarea', external: true, hidden: true },
      { key: 'checkedAt', label: 'Opgezocht op', kind: 'date', external: true, hidden: true },
      { key: 'uncertain', label: 'Nog onzeker', kind: 'textarea', external: true, hidden: true },
    ],
    keywords: ['congres', 'conferentie', 'conference', 'meetup', 'summit', 'symposium', 'seminar', 'webinar', 'pydata'],
    hosts: ['meetup.com', 'eventbrite.', 'sessionize.com'],
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
    statusKey: 'status', doneStatuses: ['geluisterd'], filterLabels: ['Nog niet', 'Geluisterd'],
    keywords: ['album', 'plaat', 'lp', 'vinyl', 'muziek', 'artiest', 'band', 'luisteren'],
    hosts: ['open.spotify.com/album', 'music.apple.com', 'bandcamp.com', 'discogs.com'],
  },


  {
    key: 'packing', label: 'Paklijst', plural: 'Paklijsten', group: 'praktisch', icon: 'Backpack',
    titleLabel: 'Naam', titlePlaceholder: 'Bijv. Vakantie',
    // Een paklijst is alleen een checklist (D22). Oude velden blijven bewaard, maar worden niet getoond.
    fields: [
      { key: 'isTemplate', label: 'Herbruikbare basislijst', kind: 'boolean', hidden: true },
      { key: 'tripDate', label: 'Vertrekdatum', kind: 'date', hidden: true },
    ],
    checklist: true, simpleDetail: true,
    keywords: ['paklijst', 'inpakken', 'meenemen', 'mee nemen', 'koffer', 'tas inpakken'],
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
  return out;
}
