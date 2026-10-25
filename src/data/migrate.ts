// Omzetten van oudere records naar het huidige schema. Gebruikt door de database-upgrade,
// het herstellen van back-ups en het terugzetten van oude revisies. Nooit gegevens weggooien:
// een veld dat verhuist, blijft bewaard onder zijn nieuwe naam.
import { LEGACY_TYPES } from './itemTypes';
import { SCHEMA_VERSION, type Item } from './model';

export function migrateItem(item: Item): Item {
  const v = item.schemaVersion ?? 1;
  if (v >= SCHEMA_VERSION) return item;
  const next: Item = { ...item, fields: { ...item.fields } };
  if (v < 2 && next.type === 'restaurant') {
    // v2: restaurant "location" heet nu "city" (plaats); adres krijgt een eigen veld.
    if (next.fields.location != null && next.fields.location !== '' && (next.fields.city == null || next.fields.city === '')) {
      next.fields.city = next.fields.location;
    }
    delete next.fields.location;
  }
  if (v < 3 && next.type === 'restaurant') {
    // v3: restaurant heeft een eigen cijfer 1–10 ("score") in plaats van 1–5 sterren ("rating"): sterren × 2.
    const stars = next.fields.rating;
    if (typeof stars === 'number' && (next.fields.score == null || next.fields.score === '')) next.fields.score = stars * 2;
    delete next.fields.rating;
  }
  if (v < 4 && next.type === 'restaurant') {
    // v4: geen status meer. Geweest = je gaf een cijfer; "favoriet" wordt het hartje.
    // "Geweest"/"favoriet" zonder cijfer blijft bewaard als visited, zodat het als geweest blijft tellen.
    const st = next.fields.status;
    if (st === 'favoriet') next.fields.favorite = true;
    if ((st === 'geweest' || st === 'favoriet') && typeof next.fields.score !== 'number') next.fields.visited = true;
    delete next.fields.status;
  }
  if (v < 5) {
    // v5: verwijderde soorten (D25) gaan naar de Inbox. Alle velden blijven bewaard (ook in back-ups);
    // de soort en de ingevulde velden komen als leesbare regel in de notities, zodat niets uit beeld verdwijnt.
    const legacy = next.type as string | null;
    if (legacy && LEGACY_TYPES[legacy]) {
      const filled = Object.entries(next.fields)
        .filter(([, val]) => val !== null && val !== '' && !(Array.isArray(val) && !val.length))
        .map(([k, val]) => `${k}: ${Array.isArray(val) ? val.join(', ') : String(val)}`);
      const note = `Was: ${LEGACY_TYPES[legacy]}${filled.length ? ` (${filled.join('; ')})` : ''}`;
      next.body = next.body ? `${next.body}\n\n${note}` : note;
      next.type = null;
    }
    if (next.suggestion && LEGACY_TYPES[next.suggestion.type as string]) next.suggestion = null;
  }
  next.schemaVersion = SCHEMA_VERSION;
  return next;
}
