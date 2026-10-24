// Herstel van dubbele items die ontstonden doordat twee tabbladen tegelijk hetzelfde voorstel toepasten
// (opgelost met een Web Lock in sync.ts, D18). Draait bij het openen van de app; alleen bij een overduidelijke kopie:
// zelfde soort, naam en plaats, allebei door Claude uit dezelfde aantekening gemaakt, binnen 5 seconden na elkaar,
// en inhoudelijk gelijk (alleen de kaartlocatie mag verschillen). De latere gaat naar de prullenbak (terug te zetten).
import { db } from './db';
import type { Item } from './model';
import { deleteItem } from './repo';
import { fold } from './util';

const GEO = new Set(['lat', 'lng', 'geoFor']);

function content(i: Item): string {
  const fields = Object.fromEntries(Object.entries(i.fields).filter(([k]) => !GEO.has(k)).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify([i.body, fields, [...i.tags].sort(), i.checklist.map((e) => [e.text, e.done])]);
}

/** Geeft de id's terug die naar de prullenbak zijn gegaan. */
export async function repairDuplicates(): Promise<string[]> {
  const items = (await db.items.toArray()).filter((i) => !i.deletedAt && i.type && i.origin?.system === 'claude');
  const groups = new Map<string, Item[]>();
  for (const i of items) {
    const key = [i.type, fold(i.title), fold(String(i.fields.city ?? '')), i.origin?.ref ?? ''].join('|');
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  const removed: string[] = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const keep = list[0];
    for (const other of list.slice(1)) {
      const close = Math.abs(Date.parse(other.createdAt) - Date.parse(keep.createdAt)) < 5000;
      if (close && content(other) === content(keep)) {
        await deleteItem(other.id);
        removed.push(other.id);
      }
    }
  }
  return removed;
}
