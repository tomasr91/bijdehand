// Voorstellen van Claude (zie docs/INDELEN.md): controleren en toepassen. Komen binnen via de sync (sync.ts).
// Claude schrijft nooit rechtstreeks in de gegevens; alles loopt via voorstellen die de app controleert.
import { db } from './db';
import { TYPE_MAP, isTypeKey } from './itemTypes';
import type { FieldValue, Item, TypeKey } from './model';
import { addSource, buildItem, entry, linkRecords, mergeChecklist, updateItem } from './repo';
import { fold, nowIso } from './util';

export const PROPOSALS_FORMAT = 'bijdehand-voorstellen';

// ---------- Voorstellen ----------

export interface Proposal {
  id: string;
  actie: 'indelen' | 'nieuw' | 'aanvullen' | 'laten' | 'verwijderen';
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
  /** Het bestaande item (indelen/laten/verwijderen) of de bronaantekening (nieuw). */
  item?: Item;
  /** Staat er al (zelfde soort, naam en plaats): niet toepassen, maar geldt wel als afgehandeld. */
  duplicate?: boolean;
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
  // Dubbele items voorkomen: zelfde soort + naam (+ plaats als beide er een hebben) bestaat al, of komt eerder in dit bestand.
  const live = items.filter((i) => !i.deletedAt && i.type);
  const inFile: { type: TypeKey; title: string; city: string }[] = [];
  const sameCity = (a: string, b: string) => !a || !b || a === b;
  const duplicateOf = (type: TypeKey, title: string, cityRaw: FieldValue | undefined): string | null => {
    const t = fold(title);
    const c = typeof cityRaw === 'string' ? fold(cityRaw) : '';
    const hit = live.find((i) => i.type === type && fold(i.title) === t && sameCity(c, typeof i.fields.city === 'string' ? fold(i.fields.city) : ''));
    if (hit) return `staat al in ${TYPE_MAP[type].plural}: "${hit.title}"`;
    if (inFile.some((x) => x.type === type && x.title === t && sameCity(c, x.city))) return 'staat twee keer in dit voorstel';
    inFile.push({ type, title: t, city: c });
    return null;
  };
  const basedOn = typeof raw.gebaseerdOp === 'string' ? raw.gebaseerdOp : '';
  const rows: ProposalRow[] = raw.voorstellen.map((v: unknown, n: number): ProposalRow => {
    const bad = (problem: string, p: Partial<Proposal> = {}): ProposalRow => ({ p: { id: `v${n + 1}`, actie: 'laten', ...p }, status: 'fout', problem });
    if (!isObj(v)) return bad('geen geldig voorstel');
    const actie = v.actie;
    if (actie !== 'indelen' && actie !== 'nieuw' && actie !== 'aanvullen' && actie !== 'laten' && actie !== 'verwijderen') return bad(`onbekende actie "${String(actie)}"`);
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
    if (actie === 'verwijderen') {
      // Alleen een exact aangewezen item (itemId) naar de prullenbak; altijd terug te zetten.
      if (!item) return bad('verwijderen kan alleen met het itemId van een bestaand item', p);
      if (item.deletedAt) return { p: { ...p, type: item.type ?? undefined }, status: 'gewijzigd', problem: 'staat al in de prullenbak', item };
      return { p: { ...p, type: item.type ?? undefined }, status: 'ok', item };
    }
    if (actie === 'aanvullen') {
      if (!isTypeKey(v.type)) return bad(`onbekende soort "${String(v.type)}"`, p);
      if (p.itemId) {
        // Exact aangewezen item (bijv. als er twee met dezelfde naam zijn).
        if (!item || item.deletedAt || item.type !== v.type) return bad('itemId hoort niet bij een bestaand item van deze soort', p);
      } else if (!p.zoek) return bad('"zoek" met de titel van het bestaande item ontbreekt', p);
      else {
      const t = fold(p.zoek.titel);
      const c = p.zoek.city ? fold(p.zoek.city) : '';
      const hits = items.filter((i) => !i.deletedAt && i.type === v.type && fold(i.title) === t && (!c || !i.fields.city || fold(String(i.fields.city)) === c));
      if (hits.length !== 1) return { p, status: 'fout', problem: hits.length ? 'meerdere items met deze titel' : `"${p.zoek.titel}" niet gevonden` };
      item = hits[0];
      }
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
      const dup = duplicateOf(v.type, p.titel || item.title, p.velden?.city);
      if (dup) return { p, status: 'gewijzigd', problem: dup, item, duplicate: true };
      return { p, status: 'ok', item };
    }
    // nieuw
    if (!p.titel) return { p, status: 'fout', problem: 'titel ontbreekt', item };
    if (p.itemId && (!item || item.deletedAt)) return { p, status: 'fout', problem: 'de aantekening waar dit uit komt bestaat niet (meer)' };
    const dup = duplicateOf(v.type, p.titel, p.velden?.city);
    if (dup) return { p, status: 'gewijzigd', problem: dup, item, duplicate: true };
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
    if (r.status === 'fout' || p.actie === 'laten' || (!p.type && p.actie !== 'verwijderen')) continue;
    if (p.actie === 'aanvullen' && r.item) {
      // Opgezochte velden mogen worden ververst; eigen velden alleen invullen als ze leeg zijn; lijsten aanvullen.
      res.undo.updated.push(structuredClone(r.item));
      const defs = new Map(TYPE_MAP[p.type!].fields.map((f) => [f.key, f]));
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
        if (p.checklist?.length) {
          const merged = mergeChecklist(cur.checklist, p.checklist);
          if (merged.length !== cur.checklist.length) { patch.checklist = merged; changed.push('checklist'); }
        }
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
        if (p.checklist?.length) { patch.checklist = mergeChecklist(cur.checklist, p.checklist); changed.push('checklist'); }
        return patch;
      });
      await attachLinks(r.item.id, p.links, res.undo);
      await db.items.update(r.item.id, { filledBy: { by: 'claude', at, fields: changed } });
      res.updated++;
    } else if (p.actie === 'verwijderen' && r.item) {
      const cur = await db.items.get(r.item.id);
      if (cur && !cur.deletedAt) {
        res.undo.updated.push(structuredClone(cur));
        await db.items.put({ ...cur, deletedAt: at, updatedAt: at, rev: cur.rev + 1 });
        res.trashed++;
      }
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
  // Een voorstel voor iets dat er al staat, telt als afgehandeld.
  const fullySplit = (id: string) => allRows.filter((r) => r.p.actie === 'nieuw' && r.p.itemId === id).every((r) => applied.has(r) || r.duplicate);
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
