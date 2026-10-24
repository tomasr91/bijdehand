// Tekstueel zoeken + filters. Eén ingang (search), zodat later semantisch zoeken of
// vragen in natuurlijke taal als extra strategie kan worden toegevoegd.
import { isDone, optionLabel, statusOf, typeDef } from './itemTypes';
import type { Item, Link, Source, TypeKey } from './model';
import { fold } from './util';

export interface SearchData {
  items: Item[];
  sources: Source[];
  links: Link[];
}

export interface SearchFilters {
  kind?: 'all' | 'items' | 'sources';
  type?: TypeKey | 'inbox';
  status?: string;
  tag?: string;
}

export type Hit = { kind: 'item'; item: Item; score: number } | { kind: 'source'; source: Source; score: number };

export interface SearchResult {
  hits: Hit[];
  /** true als niet alle zoekwoorden gevonden zijn en er gedeeltelijke resultaten getoond worden. */
  partial: boolean;
  terms: string[];
}

// Vraagwoorden en vulwoorden, zodat "Welke restaurants wilde ik nog proberen?" werkt.
const STOP = new Set(
  'welke welk wat wie waar wanneer hoe had heb heeft hebben ik mijn me mij je jij jouw de het een en of van voor over op in aan met bij om te tot nog al ook er die dat deze dit is zijn was waren wil wilde wilden wou moet moeten gebeuren staan staat bedacht opgeslagen bewaard informatie iets alles'.split(' '),
);

export function terms(query: string): string[] {
  const words = fold(query).split(/[^a-z0-9€.]+/).map((w) => w.replace(/^\.+|\.+$/g, '')).filter(Boolean);
  const kept = words.filter((w) => !STOP.has(w) && w.length > 1);
  return kept.length ? kept : words.filter((w) => w.length > 0);
}

function matches(hay: string, t: string): boolean {
  if (hay.includes(t)) return true;
  if (t.length > 4 && t.endsWith('en') && hay.includes(t.slice(0, -2))) return true;
  if (t.length > 3 && t.endsWith('s') && hay.includes(t.slice(0, -1))) return true;
  return false;
}

function linkedIds(links: Link[], id: string): string[] {
  const out: string[] = [];
  for (const l of links) {
    if (l.deletedAt) continue;
    if (l.aId === id) out.push(l.bId);
    else if (l.bId === id) out.push(l.aId);
  }
  return out;
}

function itemText(item: Item, data: SearchData, sourceById: Map<string, Source>): string {
  const def = typeDef(item.type);
  const parts = [item.body, def ? `${def.label} ${def.plural}` : 'inbox ongesorteerd', ...item.tags, ...item.checklist.map((e) => e.text)];
  for (const [k, v] of Object.entries(item.fields)) {
    if (v == null || v === '' || typeof v === 'boolean' || (Array.isArray(v) && !v.length)) continue;
    if (Array.isArray(v)) parts.push(v.join(' '));
    else parts.push(item.type ? optionLabel(item.type, k, v) : String(v));
  }
  if (def?.derivedStatus) {
    const st = def.derivedStatus.of(item);
    parts.push(def.derivedStatus.options.find((o) => o.value === st)?.label ?? '', def.derivedStatus.words?.[st] ?? '');
  }
  if (item.fields.favorite === true) parts.push('favoriet');
  for (const id of linkedIds(data.links, item.id)) {
    const s = sourceById.get(id);
    if (s && !s.deletedAt) parts.push(s.title, s.site, s.url, s.note);
  }
  return fold(parts.join(' \n '));
}

function sourceText(s: Source, itemById: Map<string, Item>, links: Link[]): string {
  const parts = [s.site, s.url, s.description, s.note, 'bron link'];
  for (const id of linkedIds(links, s.id)) {
    const it = itemById.get(id);
    if (it && !it.deletedAt) parts.push(it.title);
  }
  return fold(parts.join(' \n '));
}

function passesItemFilters(item: Item, f: SearchFilters): boolean {
  if (f.kind === 'sources') return false;
  if (f.type === 'inbox' && item.type !== null) return false;
  if (f.type && f.type !== 'inbox' && item.type !== f.type) return false;
  if (f.status && statusOf(item) !== f.status) return false;
  if (f.tag && !item.tags.includes(f.tag)) return false;
  return true;
}

function passesSourceFilters(f: SearchFilters): boolean {
  return f.kind !== 'items' && !f.type && !f.status && !f.tag;
}

export function search(data: SearchData, query: string, filters: SearchFilters = {}): SearchResult {
  const ts = terms(query);
  const sourceById = new Map(data.sources.map((s) => [s.id, s]));
  const itemById = new Map(data.items.map((i) => [i.id, i]));

  type Cand = { hit: Hit; matched: number; updated: string };
  const cands: Cand[] = [];

  for (const item of data.items) {
    if (item.deletedAt || !passesItemFilters(item, filters)) continue;
    const title = fold(item.title);
    const rest = itemText(item, data, sourceById);
    let matched = 0;
    let score = 0;
    for (const t of ts) {
      if (matches(title, t)) { matched++; score += 3; } else if (matches(rest, t)) { matched++; score += 1; }
    }
    if (isDone(item)) score -= 0.5;
    cands.push({ hit: { kind: 'item', item, score }, matched, updated: item.updatedAt });
  }
  if (passesSourceFilters(filters)) {
    for (const s of data.sources) {
      if (s.deletedAt) continue;
      const title = fold(s.title);
      const rest = sourceText(s, itemById, data.links);
      let matched = 0;
      let score = 0;
      for (const t of ts) {
        if (matches(title, t)) { matched++; score += 3; } else if (matches(rest, t)) { matched++; score += 1; }
      }
      cands.push({ hit: { kind: 'source', source: s, score }, matched, updated: s.updatedAt });
    }
  }

  const byRank = (a: Cand, b: Cand) => b.hit.score - a.hit.score || b.updated.localeCompare(a.updated);
  if (ts.length === 0) {
    return { hits: cands.sort((a, b) => b.updated.localeCompare(a.updated)).map((c) => c.hit), partial: false, terms: ts };
  }
  const strict = cands.filter((c) => c.matched === ts.length);
  if (strict.length || ts.length === 1) return { hits: strict.sort(byRank).map((c) => c.hit), partial: false, terms: ts };
  const need = Math.ceil(ts.length / 2);
  const relaxed = cands.filter((c) => c.matched >= need);
  return { hits: relaxed.sort((a, b) => b.matched - a.matched || byRank(a, b)).map((c) => c.hit), partial: relaxed.length > 0, terms: ts };
}
