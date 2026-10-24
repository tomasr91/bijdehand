// Omzetten van oudere records naar het huidige schema. Gebruikt door de database-upgrade,
// het herstellen van back-ups en het terugzetten van oude revisies. Nooit gegevens weggooien:
// een veld dat verhuist, blijft bewaard onder zijn nieuwe naam.
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
  next.schemaVersion = SCHEMA_VERSION;
  return next;
}
