// "Lijst plakken": een lijstje uit Keep (één regel per item) omzetten naar items.
// De oorspronkelijke regel wordt altijd bewaard (origin.ref), zodat er niets verloren gaat.
import type { FieldValue, TypeKey } from './model';
import { fold } from './util';

export interface PastedItem {
  line: string;
  title: string;
  fields: Record<string, FieldValue>;
  /** Tekst die niet te plaatsen was; komt in "Mijn notities". */
  note: string;
}

const CUISINES = [
  'afghaans', 'argentijns', 'chinees', 'ethiopisch', 'frans', 'grieks', 'indiaas', 'indonesisch', 'italiaans',
  'japans', 'koreaans', 'libanees', 'maleis', 'marokkaans', 'mexicaans', 'nederlands', 'perzisch', 'portugees',
  'spaans', 'surinaams', 'syrisch', 'thais', 'turks', 'vietnamees', 'aziatisch', 'mediterraan', 'oosters',
];

/** Kenmerken die vaak als eerste woord voorkomen ("vegetarisch NOORD" → kenmerk + rest). */
const LEADING_TRAITS = ['vegetarisch', 'veganistisch', 'vegan', 'fancy', 'goedkoop', 'betaalbaar', 'duur', 'reserveren'];

function capitalize(s: string): string {
  const t = s.trim();
  return t ? t[0].toLocaleUpperCase('nl') + t.slice(1) : t;
}

/** Losse regels uit geplakte tekst: opsommingstekens, vinkjes en lege regels eruit. */
export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•·]|\[[ xX]?\]|☐|☑|✔|\d+[.)])\s*/, '').replace(/[;,]\s*$/, '').trim())
    .filter(Boolean);
}

/** "Plaats - Naam (kenmerk, kenmerk)" → velden van een restaurant (of uitje/date: dan zonder keuken). */
export function parseRestaurant(line: string, withCuisine = true): PastedItem {
  let rest = line;
  let city = '';
  const m = line.match(/^(.+?)\s+[-–—:]\s+(.+)$/);
  if (m) {
    city = capitalize(m[1]);
    rest = m[2];
  }
  let inner = '';
  const p = rest.match(/^(.*?)\s*\((.*)\)\s*$/);
  if (p) {
    rest = p[1];
    inner = p[2];
  }
  const traits: string[] = [];
  const notes: string[] = [];
  let cuisine = '';
  for (const raw of inner.split(/[,;]/).map((x) => x.trim()).filter(Boolean)) {
    const f = fold(raw);
    if (withCuisine && !cuisine && CUISINES.includes(f)) {
      cuisine = capitalize(raw);
      continue;
    }
    const lead = LEADING_TRAITS.find((t) => f.startsWith(t + ' '));
    if (lead) {
      traits.push(lead);
      notes.push(raw.slice(lead.length).trim());
      continue;
    }
    traits.push(raw.toLocaleLowerCase('nl'));
  }
  const fields: Record<string, FieldValue> = {};
  if (city) fields.city = city;
  if (cuisine) fields.cuisine = cuisine;
  if (traits.length) fields.traits = traits;
  return { line, title: capitalize(rest), fields, note: notes.filter(Boolean).join('\n') };
}

/** Per soort de beste uitleg van een regel; onbekende soorten: de regel wordt de titel. */
export function parseLines(type: TypeKey, text: string): PastedItem[] {
  return splitLines(text).map((line) => {
    if (type === 'restaurant') return parseRestaurant(line);
    if (type === 'activity' || type === 'date') return parseRestaurant(line, false);
    return { line, title: capitalize(line), fields: {}, note: '' };
  });
}
