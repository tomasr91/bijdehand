// Route 1 (zie docs/INDELEN.md): Inbox delen met Claude → voorstellenbestand terug → zelf beoordelen.
// Claude schrijft nooit rechtstreeks in de gegevens; alles loopt via goedgekeurde voorstellen.
import { db } from './db';
import { TYPE_MAP, TYPES, isTypeKey, type FieldDef } from './itemTypes';
import type { FieldValue, Item, Link, Source, TypeKey } from './model';
import { addSource, buildItem, entry, linkRecords, updateItem } from './repo';
import { fold, nowIso } from './util';

// ---------- Inbox-export ----------

export const INBOX_FORMAT = 'bijdehand-inbox';
export const PROPOSALS_FORMAT = 'bijdehand-voorstellen';

export interface InboxExport {
  format: typeof INBOX_FORMAT;
  formatVersion: 1;
  exportedAt: string;
  instructies: string;
  soorten: { type: TypeKey; naam: string; velden: { veld: string; label: string; soort: string; opties?: string[]; voorbeeld?: string }[] }[];
  /** Bestaande waarden, zodat Claude dezelfde schrijfwijze gebruikt (bijv. "Utrecht", "fancy"). */
  bekend: Record<string, string[]>;
  items: { id: string; titel: string; tekst: string; checklist: { tekst: string; klaar: boolean }[]; tags: string[]; links: { url: string; titel: string; notitie: string }[]; voorstelRegels?: string }[];
}

const INSTRUCTIES =
  'Deel elk item in volgens docs/INDELEN.md (project Bijdehand). Antwoord met één JSON-bestand in het formaat "bijdehand-voorstellen" ' +
  '(zie INDELEN.md → Voorstellenbestand). Gebruik alleen de soorten en velden hieronder. Bij twijfel: actie "laten" met een vraag in "reden". ' +
  'Verzin geen gegevens die niet in de tekst staan.';

const KIND_LABEL: Record<FieldDef['kind'], string> = {
  text: 'tekst', textarea: 'tekst (meerdere regels)', number: 'getal', money: 'bedrag in euro (getal)', date: 'datum JJJJ-MM-DD',
  select: 'keuze', rating: 'getal 1-5', boolean: 'ja/nee (true/false)', list: 'lijst met korte teksten', url: 'link (https://…)', score: 'cijfer 1-10, één decimaal (bijv. 7.5)',
};

export function buildInboxExport(items: Item[], sources: Source[], links: Link[]): InboxExport {
  const live = items.filter((i) => !i.deletedAt);
  const sourceById = new Map(sources.filter((s) => !s.deletedAt).map((s) => [s.id, s]));
  const bekend: Record<string, Set<string>> = {};
  const add = (k: string, v: unknown) => {
    for (const x of Array.isArray(v) ? v : [v]) if (typeof x === 'string' && x.trim()) (bekend[k] ??= new Set()).add(x.trim());
  };
  for (const i of live) {
    if (i.type === 'restaurant') { add('restaurant.city', i.fields.city); add('restaurant.cuisine', i.fields.cuisine); add('restaurant.traits', i.fields.traits); }
    if (i.type === 'gift' || i.type === 'size') add(`${i.type}.person`, i.fields.person);
    if (i.type === 'game') add('game.platform', i.fields.platform);
    add('tags', i.tags);
  }
  return {
    format: INBOX_FORMAT,
    formatVersion: 1,
    exportedAt: nowIso(),
    instructies: INSTRUCTIES,
    soorten: TYPES.map((t) => ({
      type: t.key,
      naam: t.plural,
      velden: t.fields.map((f) => ({ veld: f.key, label: f.label, soort: KIND_LABEL[f.kind], ...(f.options ? { opties: f.options.map((o) => o.value) } : {}), ...(f.placeholder ? { voorbeeld: f.placeholder } : {}) })),
    })),
    bekend: Object.fromEntries(Object.entries(bekend).map(([k, v]) => [k, [...v].sort((a, b) => a.localeCompare(b, 'nl'))])),
    items: live
      .filter((i) => i.type === null)
      .map((i) => ({
        id: i.id,
        titel: i.title,
        tekst: i.body,
        checklist: i.checklist.map((e) => ({ tekst: e.text, klaar: e.done })),
        tags: i.tags,
        links: links
          .filter((l) => !l.deletedAt && (l.aId === i.id || l.bId === i.id))
          .map((l) => sourceById.get(l.aId === i.id ? l.bId : l.aId))
          .filter((s): s is Source => !!s)
          .map((s) => ({ url: s.url, titel: s.title, notitie: s.note })),
        ...(i.suggestion ? { voorstelRegels: i.suggestion.type } : {}),
      })),
  };
}

export function inboxFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `bijdehand-inbox-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

// ---------- Voorstellen ----------

export interface Proposal {
  id: string;
  actie: 'indelen' | 'nieuw' | 'aanvullen' | 'laten';
  /** aanvullen: welk bestaand item (zelfde soort, titel en eventueel plaats). */
  zoek?: { titel: string; city?: string };
  /** Links die als bron worden bewaard en gekoppeld (website, Google Maps, TheFork…). */
  links?: { url: string; titel?: string }[];
  /** indelen/laten: het Inbox-item. nieuw: de aantekening waar het uit komt (optioneel). */
  itemId?: string;
  type?: TypeKey;
  titel?: string;
  velden?: Record<string, FieldValue>;
  /** aanvullen: waarden uit lijstvelden halen (bijv. een label dat Claude eerder verkeerd koos). Alleen precies deze waarden. */
  weghalen?: Record<string, string[]>;
  tekst?: string;
  tags?: string[];
  checklist?: string[];
  reden?: string;
}

export type RowStatus = 'ok' | 'gewijzigd' | 'fout' | 'laten';

export interface ProposalRow {
  p: Proposal;
  status: RowStatus;
  problem?: string;
  /** Het bestaande item (indelen/laten) of de bronaantekening (nieuw). */
  item?: Item;
}

export interface ParsedProposals {
  createdAt: string;
  basedOn: string;
  rows: ProposalRow[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Controleert en normaliseert de velden tegen het register. Onbekende velden of ongeldige waarden = fout. */
export function checkFields(type: TypeKey, raw: unknown): { fields: Record<string, FieldValue>; problems: string[] } {
  const fields: Record<string, FieldValue> = {};
  const problems: string[] = [];
  if (raw === undefined || raw === null) return { fields, problems };
  if (!isObj(raw)) return { fields, problems: ['velden is geen object'] };
  const defs = new Map(TYPE_MAP[type].fields.map((f) => [f.key, f]));
  for (const [k, v] of Object.entries(raw)) {
    const f = defs.get(k);
    if (!f) { problems.push(`onbekend veld "${k}"`); continue; }
    if (v === null || v === '') { fields[k] = null; continue; }
    switch (f.kind) {
      case 'select':
        if (typeof v === 'string' && f.options!.some((o) => o.value === v)) fields[k] = v;
        else problems.push(`${f.label}: "${String(v)}" is geen geldige keuze`);
        break;
      case 'rating':
        if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5) fields[k] = v;
        else problems.push(`${f.label}: moet 1 t/m 5 zijn`);
        break;
      case 'score':
        if (typeof v === 'number' && v >= 1 && v <= 10) fields[k] = Math.round(v * 10) / 10;
        else problems.push(`${f.label}: moet een cijfer van 1 t/m 10 zijn`);
        break;
      case 'number':
      case 'money':
        if (typeof v === 'number' && Number.isFinite(v)) fields[k] = v;
        else problems.push(`${f.label}: moet een getal zijn`);
        break;
      case 'date':
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) fields[k] = v;
        else problems.push(`${f.label}: datum moet JJJJ-MM-DD zijn`);
        break;
      case 'boolean':
        if (typeof v === 'boolean') fields[k] = v;
        else problems.push(`${f.label}: moet true of false zijn`);
        break;
      case 'url':
        if (typeof v === 'string' && /^https?:\/\/\S+$/i.test(v.trim())) fields[k] = v.trim();
        else problems.push(`${f.label}: moet een link zijn die begint met http:// of https://`);
        break;
      case 'list':
        if (Array.isArray(v) && v.every((x) => typeof x === 'string')) fields[k] = (v as string[]).map((x) => x.trim()).filter(Boolean);
        else problems.push(`${f.label}: moet een lijst met teksten zijn`);
        break;
      default:
        if (typeof v === 'string') fields[k] = v.trim();
        else problems.push(`${f.label}: moet tekst zijn`);
    }
  }
  return { fields, problems };
}

export type ParseProposalsResult = { ok: true; value: ParsedProposals } | { ok: false; error: string };

export function parseProposals(text: string, items: Item[]): ParseProposalsResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Dit bestand is geen geldige JSON.' };
  }
  if (!isObj(raw) || raw.format !== PROPOSALS_FORMAT) return { ok: false, error: 'Dit is geen voorstellenbestand van Bijdehand ("bijdehand-voorstellen").' };
  if (raw.formatVersion !== 1) return { ok: false, error: 'Onbekende versie van het voorstellenbestand.' };
  if (!Array.isArray(raw.voorstellen)) return { ok: false, error: 'Het bestand bevat geen lijst "voorstellen".' };
  const byId = new Map(items.map((i) => [i.id, i]));
  const basedOn = typeof raw.gebaseerdOp === 'string' ? raw.gebaseerdOp : '';
  const rows: ProposalRow[] = raw.voorstellen.map((v: unknown, n: number): ProposalRow => {
    const bad = (problem: string, p: Partial<Proposal> = {}): ProposalRow => ({ p: { id: `v${n + 1}`, actie: 'laten', ...p }, status: 'fout', problem });
    if (!isObj(v)) return bad('geen geldig voorstel');
    const actie = v.actie;
    if (actie !== 'indelen' && actie !== 'nieuw' && actie !== 'aanvullen' && actie !== 'laten') return bad(`onbekende actie "${String(actie)}"`);
    const p: Proposal = {
      id: typeof v.id === 'string' && v.id ? v.id : `v${n + 1}`,
      actie,
      itemId: typeof v.itemId === 'string' ? v.itemId : undefined,
      titel: typeof v.titel === 'string' ? v.titel.trim() : undefined,
      tekst: typeof v.tekst === 'string' ? v.tekst : undefined,
      tags: Array.isArray(v.tags) ? v.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim().replace(/^#/, '').toLowerCase()).filter(Boolean) : undefined,
      checklist: Array.isArray(v.checklist) ? v.checklist.filter((t): t is string => typeof t === 'string' && !!t.trim()) : undefined,
      reden: typeof v.reden === 'string' ? v.reden : undefined,
      zoek: isObj(v.zoek) && typeof v.zoek.titel === 'string' ? { titel: v.zoek.titel, ...(typeof v.zoek.city === 'string' ? { city: v.zoek.city } : {}) } : undefined,
      links: Array.isArray(v.links)
        ? v.links.filter((l): l is { url: string; titel?: string } => isObj(l) && typeof l.url === 'string' && /^https?:\/\//.test(l.url)).map((l) => ({ url: l.url, ...(typeof l.titel === 'string' ? { titel: l.titel } : {}) }))
        : undefined,
    };
    let item = p.itemId ? byId.get(p.itemId) : undefined;
    if (actie === 'laten') return { p, status: 'laten', item };
    if (actie === 'aanvullen') {
      if (!isTypeKey(v.type)) return bad(`onbekende soort "${String(v.type)}"`, p);
      if (!p.zoek) return bad('"zoek" met de titel van het bestaande item ontbreekt', p);
      const t = fold(p.zoek.titel);
      const c = p.zoek.city ? fold(p.zoek.city) : '';
      const hits = items.filter((i) => !i.deletedAt && i.type === v.type && fold(i.title) === t && (!c || !i.fields.city || fold(String(i.fields.city)) === c));
      if (hits.length !== 1) return { p, status: 'fout', problem: hits.length ? 'meerdere items met deze titel' : `"${p.zoek.titel}" niet gevonden` };
      item = hits[0];
    }
    if (!isTypeKey(v.type)) return bad(`onbekende soort "${String(v.type)}"`, p);
    p.type = v.type;
    const { fields, problems } = checkFields(v.type, v.velden);
    p.velden = fields;
    if (v.weghalen !== undefined) {
      if (actie !== 'aanvullen') problems.push('weghalen kan alleen bij aanvullen');
      else if (!isObj(v.weghalen)) problems.push('weghalen is geen object');
      else {
        p.weghalen = {};
        for (const [k, vals] of Object.entries(v.weghalen)) {
          const f = TYPE_MAP[v.type].fields.find((x) => x.key === k);
          if (f?.kind !== 'list') problems.push(`weghalen: "${k}" is geen lijstveld`);
          else if (!Array.isArray(vals) || !vals.every((x) => typeof x === 'string')) problems.push(`weghalen: ${f.label} moet een lijst met teksten zijn`);
          else p.weghalen[k] = vals as string[];
        }
      }
    }
    if (problems.length) return { p, status: 'fout', problem: problems.join('; '), item };
    if (actie === 'aanvullen') return { p, status: 'ok', item };
    if (actie === 'indelen') {
      if (!item || item.deletedAt) return { p, status: 'fout', problem: 'het Inbox-item bestaat niet (meer)' };
      if (item.type !== null) return { p, status: 'gewijzigd', problem: 'is intussen al ingedeeld', item };
      if (basedOn && item.updatedAt > basedOn) return { p, status: 'gewijzigd', problem: 'is na het delen nog gewijzigd', item };
      return { p, status: 'ok', item };
    }
    // nieuw
    if (!p.titel) return { p, status: 'fout', problem: 'titel ontbreekt', item };
    if (p.itemId && (!item || item.deletedAt)) return { p, status: 'fout', problem: 'de aantekening waar dit uit komt bestaat niet (meer)' };
    return { p, status: 'ok', item };
  });
  return { ok: true, value: { createdAt: typeof raw.gemaaktOp === 'string' ? raw.gemaaktOp : '', basedOn, rows } };
}

// ---------- Toepassen ----------

export interface ApplyResult {
  updated: number;
  created: number;
  trashed: number;
  undo: { updated: Item[]; createdIds: string[]; trashedIds: string[]; linkIds: string[]; sourceIds: string[] };
}

/** Bewaart links als bron (niet dubbel) en koppelt ze aan het item. */
async function attachLinks(itemId: string, links: Proposal['links'], undo: ApplyResult['undo']): Promise<void> {
  for (const l of links ?? []) {
    const { source, existed } = await addSource({ url: l.url, title: l.titel, infoVia: 'opgezocht' });
    if (!existed) undo.sourceIds.push(source.id);
    const before = await db.links.count();
    const link = await linkRecords('item', itemId, 'source', source.id);
    if (link && (await db.links.count()) > before) undo.linkIds.push(link.id);
  }
}

/**
 * Past goedgekeurde voorstellen toe (`rows`; `allRows` = het hele bestand). Een aantekening gaat alleen naar
 * de prullenbak als ze volledig is opgesplitst: elk "nieuw"-voorstel eruit is toegepast en ze is zelf niet
 * ingedeeld. De oorspronkelijke tekst staat bij elk nieuw item.
 */
export async function applyProposals(rows: ProposalRow[], allRows: ProposalRow[] = rows): Promise<ApplyResult> {
  const at = nowIso();
  const res: ApplyResult = { updated: 0, created: 0, trashed: 0, undo: { updated: [], createdIds: [], trashedIds: [], linkIds: [], sourceIds: [] } };
  const classified = new Set(rows.filter((r) => r.p.actie === 'indelen').map((r) => r.p.itemId));
  const splitSources = new Set<string>();

  for (const r of rows) {
    const p = r.p;
    if (r.status === 'fout' || p.actie === 'laten' || !p.type) continue;
    if (p.actie === 'aanvullen' && r.item) {
      // Opgezochte velden mogen worden ververst; eigen velden alleen invullen als ze leeg zijn; lijsten aanvullen.
      res.undo.updated.push(structuredClone(r.item));
      const defs = new Map(TYPE_MAP[p.type].fields.map((f) => [f.key, f]));
      const changed: string[] = [];
      const claudeOwned = new Set(r.item.filledBy?.fields ?? []);
      await updateItem(r.item.id, (cur) => {
        const fields = { ...cur.fields };
        // Eerst weghalen (alleen de genoemde waarden), daarna aanvullen; zo kan Claude ook de volgorde herschikken.
        for (const [k, vals] of Object.entries(p.weghalen ?? {})) {
          const now = Array.isArray(fields[k]) ? (fields[k] as string[]) : [];
          const drop = new Set(vals.map(fold));
          const kept = now.filter((x) => !drop.has(fold(x)));
          if (kept.length !== now.length) { fields[k] = kept; changed.push(k); }
        }
        for (const [k, v] of Object.entries(p.velden ?? {})) {
          const f = defs.get(k);
          const now = fields[k];
          // Leeg, of eerder door Claude ingevuld en nog niet als "Gecontroleerd" afgevinkt.
          const empty = now === undefined || now === null || now === '' || (Array.isArray(now) && !now.length) || claudeOwned.has(k);
          if (f?.kind === 'list' && Array.isArray(v)) {
            const merged = [...new Set([...(Array.isArray(now) ? now : []), ...v])];
            if (JSON.stringify(merged) !== JSON.stringify(Array.isArray(now) ? now : [])) { fields[k] = merged; changed.push(k); }
          } else if (v === null) {
            // Leegmaken mag alleen bij opgezochte velden (bijv. een onzekerheid die is opgelost); eigen velden nooit.
            if (f?.external && now !== undefined && now !== null && now !== '') { fields[k] = null; changed.push(k); }
          } else if ((f?.external || empty) && JSON.stringify(now) !== JSON.stringify(v)) {
            fields[k] = v;
            changed.push(k);
          }
        }
        const patch: Parameters<typeof updateItem>[1] = { fields };
        if (p.titel && p.titel !== cur.title) { patch.title = p.titel; changed.push('title'); }
        if (p.tekst) { patch.body = cur.body ? `${cur.body}\n${p.tekst}` : p.tekst; changed.push('body'); }
        if (p.tags?.length) { patch.tags = [...new Set([...cur.tags, ...p.tags])]; changed.push('tags'); }
        return patch;
      });
      await attachLinks(r.item.id, p.links, res.undo);
      if (p.links?.length) changed.push('links');
      await db.items.update(r.item.id, { filledBy: { by: 'claude', at, fields: [...new Set([...claudeOwned, ...changed])] } });
      res.updated++;
      continue;
    }
    if (p.actie === 'indelen' && r.item) {
      res.undo.updated.push(structuredClone(r.item));
      const changed = ['type', ...Object.keys(p.velden ?? {})];
      await updateItem(r.item.id, (cur) => {
        const patch: Parameters<typeof updateItem>[1] = { type: p.type!, fields: { ...cur.fields, ...p.velden } };
        if (p.titel && p.titel !== cur.title) { patch.title = p.titel; changed.push('title'); }
        if (p.tekst !== undefined && p.tekst !== cur.body) { patch.body = p.tekst; changed.push('body'); }
        if (p.tags?.length) { patch.tags = [...new Set([...cur.tags, ...p.tags])]; changed.push('tags'); }
        if (p.checklist?.length) { patch.checklist = [...cur.checklist, ...p.checklist.map((t) => entry(t))]; changed.push('checklist'); }
        return patch;
      });
      await attachLinks(r.item.id, p.links, res.undo);
      await db.items.update(r.item.id, { filledBy: { by: 'claude', at, fields: changed } });
      res.updated++;
    } else if (p.actie === 'nieuw') {
      const item = buildItem({
        type: p.type,
        title: p.titel,
        body: p.tekst ?? '',
        fields: p.velden,
        tags: p.tags,
        checklist: (p.checklist ?? []).map((t) => entry(t)),
        origin: { system: 'claude', ref: r.item ? [r.item.title, r.item.body].filter(Boolean).join('\n') : undefined, at },
      });
      item.filledBy = { by: 'claude', at, fields: ['type', 'title', ...Object.keys(p.velden ?? {})] };
      await db.items.add(item);
      await attachLinks(item.id, p.links, res.undo);
      res.undo.createdIds.push(item.id);
      res.created++;
      if (r.item) {
        // Links van de aantekening meenemen naar het nieuwe item.
        const links = (await db.links.where('aId').equals(r.item.id).toArray()).concat(await db.links.where('bId').equals(r.item.id).toArray());
        for (const l of links.filter((x) => !x.deletedAt && (x.aKind === 'source' || x.bKind === 'source'))) {
          await linkRecords('item', item.id, 'source', l.aId === r.item.id ? l.bId : l.aId);
        }
        if (!classified.has(r.item.id)) splitSources.add(r.item.id);
      }
    }
  }
  // Alleen naar de prullenbak als élk "nieuw"-voorstel uit deze aantekening is toegepast.
  const applied = new Set(rows.filter((r) => r.status !== 'fout'));
  const fullySplit = (id: string) => allRows.filter((r) => r.p.actie === 'nieuw' && r.p.itemId === id).every((r) => applied.has(r));
  for (const id of splitSources) {
    if (!fullySplit(id)) continue;
    const cur = await db.items.get(id);
    if (cur && !cur.deletedAt && cur.type === null) {
      await db.items.put({ ...cur, deletedAt: at, updatedAt: at, rev: cur.rev + 1 });
      res.undo.trashedIds.push(id);
      res.trashed++;
    }
  }
  return res;
}

export async function undoApply(u: ApplyResult['undo']): Promise<void> {
  await db.transaction('rw', db.items, db.links, db.revisions, db.sources, async () => {
    await db.links.bulkDelete(u.linkIds ?? []);
    await db.sources.bulkDelete(u.sourceIds ?? []);
    for (const before of u.updated) await db.items.put({ ...before, updatedAt: nowIso(), rev: before.rev + 2 });
    await db.items.bulkDelete(u.createdIds);
    for (const id of u.createdIds) {
      await db.links.where('aId').equals(id).delete();
      await db.links.where('bId').equals(id).delete();
    }
    for (const id of u.trashedIds) {
      const cur = await db.items.get(id);
      if (cur) await db.items.put({ ...cur, deletedAt: null, updatedAt: nowIso(), rev: cur.rev + 1 });
    }
  });
}
