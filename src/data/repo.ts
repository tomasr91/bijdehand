// Alle schrijfacties op de gegevens. De UI schrijft nooit rechtstreeks naar de database.
// Elke wijziging: transactie, rev+1, updatedAt, en een revisie van de vorige versie.
import { db } from './db';
import { migrateItem } from './migrate';
import { defaultFields, TYPE_MAP } from './itemTypes';
import { SCHEMA_VERSION, type ChecklistEntry, type EntityKind, type FieldValue, type Item, type Link, type Origin, type Source, type Suggestion, type TypeKey } from './model';
import { addDays, localDate, newId, normalizeUrl, nowIso, siteOf } from './util';

/** Wijzigingen binnen dit venster vallen samen tot één revisie (geen revisie per toetsaanslag). */
const REVISION_WINDOW_MS = 2 * 60 * 1000;

async function recordRevision(kind: EntityKind, before: Item | Source): Promise<void> {
  const last = await db.revisions
    .where('[entityId+changedAt]')
    .between([before.id, ''], [before.id, '￿'])
    .last();
  if (last && Date.now() - Date.parse(last.changedAt) < REVISION_WINDOW_MS) return;
  await db.revisions.add({ id: newId(), kind, entityId: before.id, rev: before.rev, snapshot: structuredClone(before), changedAt: nowIso() });
}

async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* niet beschikbaar: status is zichtbaar in Instellingen */
  }
}

// ---------- Items ----------

export interface NewItem {
  type?: TypeKey | null;
  title?: string;
  body?: string;
  fields?: Record<string, FieldValue>;
  checklist?: ChecklistEntry[];
  tags?: string[];
  origin?: Origin | null;
  suggestion?: Suggestion | null;
}

export function buildItem(input: NewItem): Item {
  const now = nowIso();
  const type = input.type ?? null;
  return {
    id: newId(),
    type,
    title: (input.title ?? '').trim(),
    body: input.body ?? '',
    fields: { ...(type ? defaultFields(type) : {}), ...(input.fields ?? {}) },
    checklist: input.checklist ?? [],
    tags: input.tags ?? [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rev: 1,
    origin: input.origin ?? null,
    suggestion: type ? null : input.suggestion ?? null,
    schemaVersion: SCHEMA_VERSION,
  };
}

export async function createItem(input: NewItem): Promise<Item> {
  const item = buildItem(input);
  await db.items.add(item);
  void requestPersistence();
  return item;
}

export type ItemPatch = Partial<Pick<Item, 'type' | 'title' | 'body' | 'fields' | 'checklist' | 'tags' | 'suggestion'>>;

/** Patch of functie die de patch berekent uit de actuele versie (binnen de transactie, zonder race). */
export async function updateItem(id: string, change: ItemPatch | ((cur: Item) => ItemPatch)): Promise<Item | undefined> {
  return db.transaction('rw', db.items, db.revisions, async () => {
    const cur = await db.items.get(id);
    if (!cur) return undefined;
    const patch = typeof change === 'function' ? change(cur) : change;
    await recordRevision('item', cur);
    const next: Item = { ...cur, ...patch, rev: cur.rev + 1, updatedAt: nowIso() };
    if (patch.type !== undefined && patch.type !== cur.type) {
      // Bij indelen: standaardvelden aanvullen, bestaande waarden nooit weggooien.
      next.fields = { ...(patch.type ? defaultFields(patch.type) : {}), ...cur.fields, ...(patch.fields ?? {}) };
      if (patch.type) next.suggestion = null;
    }
    await db.items.put(next);
    return next;
  });
}

/** "Gecontroleerd": de markering "Ingevuld door Claude" weghalen. Inhoud verandert niet, dus geen revisie. */
export async function markChecked(id: string): Promise<void> {
  await db.items.update(id, { filledBy: null });
}

export async function setField(id: string, key: string, value: FieldValue): Promise<void> {
  await updateItem(id, (cur) => ({ fields: { ...cur.fields, [key]: value } }));
}

export async function deleteItem(id: string): Promise<void> {
  await db.transaction('rw', db.items, async () => {
    const cur = await db.items.get(id);
    if (cur && !cur.deletedAt) await db.items.put({ ...cur, deletedAt: nowIso(), updatedAt: nowIso(), rev: cur.rev + 1 });
  });
}

export async function restoreItem(id: string): Promise<void> {
  await db.transaction('rw', db.items, async () => {
    const cur = await db.items.get(id);
    if (cur?.deletedAt) await db.items.put({ ...cur, deletedAt: null, updatedAt: nowIso(), rev: cur.rev + 1 });
  });
}

/** Definitief verwijderen — alleen vanuit de prullenbak, na bevestiging. */
export async function purgeItem(id: string): Promise<void> {
  await db.transaction('rw', db.items, db.revisions, db.links, async () => {
    await db.items.delete(id);
    await db.revisions.where('entityId').equals(id).delete();
    await db.links.where('aId').equals(id).delete();
    await db.links.where('bId').equals(id).delete();
  });
}

export async function restoreRevision(revisionId: string): Promise<void> {
  const rev = await db.revisions.get(revisionId);
  if (!rev) return;
  if (rev.kind === 'item') {
    const s = migrateItem(rev.snapshot as Item);
    await updateItem(rev.entityId, { type: s.type, title: s.title, body: s.body, fields: s.fields, checklist: s.checklist, tags: s.tags });
  } else {
    const s = rev.snapshot as Source;
    await updateSource(rev.entityId, { title: s.title, description: s.description, imageUrl: s.imageUrl, note: s.note, url: s.url });
  }
}

// ---------- Checklist ----------

export function entry(text: string, done = false): ChecklistEntry {
  return { id: newId(), text: text.trim(), done };
}

export async function toggleEntry(itemId: string, entryId: string): Promise<void> {
  await updateItem(itemId, (cur) => ({ checklist: cur.checklist.map((e) => (e.id === entryId ? { ...e, done: !e.done } : e)) }));
}

/** Nieuwe paklijst op basis van een basislijst; alle regels weer open. */
export async function copyPackingList(templateId: string, title: string): Promise<Item | undefined> {
  const tpl = await db.items.get(templateId);
  if (!tpl) return undefined;
  const item = await createItem({
    type: 'packing',
    title,
    fields: { isTemplate: false, tripDate: null },
    checklist: tpl.checklist.map((e) => entry(e.text)),
    tags: [...tpl.tags],
  });
  await linkRecords('item', item.id, 'item', tpl.id);
  return item;
}

// ---------- Planten ----------

export async function markPlantCared(id: string, today = localDate()): Promise<void> {
  await updateItem(id, (cur) => {
    const interval = Number(cur.fields.intervalDays);
    return { fields: { ...cur.fields, lastCare: today, nextCare: interval > 0 ? addDays(today, interval) : null } };
  });
}

// ---------- Bronnen ----------

export async function findSourceByUrl(url: string): Promise<Source | undefined> {
  const n = normalizeUrl(url);
  const all = await db.sources.where('normalizedUrl').equals(n).toArray();
  return all.find((s) => !s.deletedAt) ?? all[0];
}

export interface NewSource {
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  note?: string;
  infoVia?: Source['infoVia'];
  origin?: Origin | null;
}

export function buildSource(input: NewSource): Source {
  const now = nowIso();
  return {
    id: newId(),
    url: input.url.trim(),
    normalizedUrl: normalizeUrl(input.url),
    title: (input.title ?? '').trim(),
    site: siteOf(input.url.trim()),
    description: input.description ?? '',
    imageUrl: input.imageUrl ?? '',
    infoVia: input.infoVia ?? 'handmatig',
    note: input.note ?? '',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rev: 1,
    origin: input.origin ?? null,
    schemaVersion: SCHEMA_VERSION,
  };
}

/** Maakt een bron aan, of geeft de bestaande terug als de link al bewaard is. */
export async function addSource(input: NewSource): Promise<{ source: Source; existed: boolean }> {
  const existing = await findSourceByUrl(input.url);
  if (existing) {
    if (existing.deletedAt) await restoreSource(existing.id);
    // Lege velden aanvullen met nieuwe invoer; bestaande tekst nooit overschrijven.
    const fill: SourcePatch = {};
    if (!existing.title && input.title?.trim()) fill.title = input.title.trim();
    if (input.note?.trim()) fill.note = existing.note ? `${existing.note}\n${input.note.trim()}` : input.note.trim();
    if (Object.keys(fill).length) await updateSource(existing.id, fill);
    return { source: (await db.sources.get(existing.id))!, existed: true };
  }
  const source = buildSource(input);
  await db.sources.add(source);
  void requestPersistence();
  return { source, existed: false };
}

export type SourcePatch = Partial<Pick<Source, 'url' | 'title' | 'description' | 'imageUrl' | 'note'>>;

export async function updateSource(id: string, patch: SourcePatch): Promise<void> {
  await db.transaction('rw', db.sources, db.revisions, async () => {
    const cur = await db.sources.get(id);
    if (!cur) return;
    await recordRevision('source', cur);
    const next: Source = { ...cur, ...patch, rev: cur.rev + 1, updatedAt: nowIso() };
    if (patch.url !== undefined) {
      next.normalizedUrl = normalizeUrl(patch.url);
      next.site = siteOf(patch.url);
    }
    await db.sources.put(next);
  });
}

export async function deleteSource(id: string): Promise<void> {
  await db.transaction('rw', db.sources, async () => {
    const cur = await db.sources.get(id);
    if (cur && !cur.deletedAt) await db.sources.put({ ...cur, deletedAt: nowIso(), updatedAt: nowIso(), rev: cur.rev + 1 });
  });
}

export async function restoreSource(id: string): Promise<void> {
  await db.transaction('rw', db.sources, async () => {
    const cur = await db.sources.get(id);
    if (cur?.deletedAt) await db.sources.put({ ...cur, deletedAt: null, updatedAt: nowIso(), rev: cur.rev + 1 });
  });
}

export async function purgeSource(id: string): Promise<void> {
  await db.transaction('rw', db.sources, db.revisions, db.links, async () => {
    await db.sources.delete(id);
    await db.revisions.where('entityId').equals(id).delete();
    await db.links.where('aId').equals(id).delete();
    await db.links.where('bId').equals(id).delete();
  });
}

// ---------- Relaties ----------

export async function linkRecords(aKind: EntityKind, aId: string, bKind: EntityKind, bId: string): Promise<Link | undefined> {
  if (aId === bId) return undefined;
  return db.transaction('rw', db.links, async () => {
    const candidates = [...(await db.links.where('aId').equals(aId).toArray()), ...(await db.links.where('bId').equals(aId).toArray())];
    const existing = candidates.find((l) => (l.aId === aId && l.bId === bId) || (l.aId === bId && l.bId === aId));
    if (existing) {
      if (existing.deletedAt) {
        const next = { ...existing, deletedAt: null, updatedAt: nowIso() };
        await db.links.put(next);
        return next;
      }
      return existing;
    }
    const now = nowIso();
    const link: Link = { id: newId(), aKind, aId, bKind, bId, createdAt: now, updatedAt: now, deletedAt: null };
    await db.links.add(link);
    return link;
  });
}

export async function unlink(linkId: string): Promise<void> {
  const cur = await db.links.get(linkId);
  if (cur && !cur.deletedAt) await db.links.put({ ...cur, deletedAt: nowIso(), updatedAt: nowIso() });
}

// ---------- Snel vastleggen ----------

export interface Capture {
  type: TypeKey | null;
  title: string;
  body?: string;
  url?: string;
  urlTitle?: string;
  sourceNote?: string;
  checklist?: string[];
  suggestion?: Suggestion | null;
  infoVia?: Source['infoVia'];
}

export interface CaptureResult {
  item: Item;
  source?: Source;
  sourceExisted: boolean;
}

/** Eén actie voor de Toevoegen-knop: item (eventueel ongesorteerd) + optionele bron + checklist. */
export async function capture(c: Capture): Promise<CaptureResult> {
  let source: Source | undefined;
  let sourceExisted = false;
  if (c.url) {
    const r = await addSource({ url: c.url, title: c.urlTitle, note: c.sourceNote, infoVia: c.infoVia });
    source = r.source;
    sourceExisted = r.existed;
  }
  const title = c.title.trim() || source?.title || source?.site || 'Zonder titel';
  const item = await createItem({
    type: c.type,
    title,
    body: c.body ?? '',
    checklist: (c.checklist ?? []).filter((t) => t.trim()).map((t) => entry(t)),
    suggestion: c.suggestion ?? null,
    fields: c.type === 'packing' ? { isTemplate: false } : undefined,
  });
  if (source) await linkRecords('item', item.id, 'source', source.id);
  return { item, source, sourceExisted };
}

// ---------- Meta ----------

export async function getMeta(key: string): Promise<string | undefined> {
  return (await db.meta.get(key))?.value;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value });
}

export const META_LAST_EXPORT = 'lastExportAt';

/** Typedefinitie voor de UI om te weten of een soort bestaat (handig bij import). */
export const KNOWN_TYPES = Object.keys(TYPE_MAP);

// ---------- Lijst plakken ----------

/** Maakt in één transactie items aan uit geplakte regels; de oorspronkelijke regel gaat mee in origin. */
export async function createPasted(type: TypeKey, rows: { line: string; title: string; fields: Record<string, FieldValue>; note: string }[]): Promise<string[]> {
  const at = nowIso();
  const items = rows.map((r) => buildItem({ type, title: r.title, body: r.note, fields: r.fields, origin: { system: 'paste', ref: r.line, at } }));
  await db.items.bulkAdd(items);
  void requestPersistence();
  return items.map((i) => i.id);
}

/** Ongedaan maken van een plak-actie: alleen items die sindsdien niet zijn gewijzigd. */
export async function undoPasted(ids: string[]): Promise<number> {
  return db.transaction('rw', db.items, async () => {
    const items = (await db.items.bulkGet(ids)).filter((i): i is Item => !!i && i.rev === 1);
    await db.items.bulkDelete(items.map((i) => i.id));
    return items.length;
  });
}
