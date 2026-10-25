import { Check, ChevronDown, CircleAlert, ExternalLink, History, Info, Plus, RotateCcw, Search as SearchIcon, Star, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { GROUPS, TYPES, shownFields, typeDef, type FieldDef } from '../data/itemTypes';
import type { ChecklistEntry, EntityKind, FieldValue, Item, Revision, Source, TypeKey } from '../data/model';
import * as repo from '../data/repo';
import { search } from '../data/search';
import { formatDate, formatDateTime, formatScore, isUrl, findUrl, parseScore } from '../data/util';
import { db } from '../data/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useData, useLinked, useToast } from '../ui/context';
import { tracked, useDraft, useSaveState } from '../ui/draft';
import { navigate } from '../ui/router';
import { AutoText, Sheet, TypeIcon } from './ui';

// ---------- Soort kiezen ----------

/** Soort kiezen. Eerst de soorten die je gebruikt; de rest (nog leeg) staat ingeklapt onder "Andere soorten". */
export function TypePicker({ open, value, onPick, onClose, allowInbox = true }: {
  open: boolean;
  value: TypeKey | null;
  onPick: (t: TypeKey | null) => void;
  onClose: () => void;
  allowInbox?: boolean;
}) {
  const { liveItems } = useData();
  const [more, setMore] = useState(false);
  const usedKeys = new Set<TypeKey>(liveItems.map((i) => i.type).filter((t): t is TypeKey => t !== null));
  if (value) usedKeys.add(value);
  const used = TYPES.filter((t) => usedKeys.has(t.key));
  const rest = TYPES.filter((t) => !usedKeys.has(t.key));
  const option = (t: (typeof TYPES)[number]) => (
    <button key={t.key} type="button" className={`type-option ${value === t.key ? 'on' : ''}`} onClick={() => onPick(t.key)}>
      <TypeIcon type={t.key} /> <span>{t.plural}</span>
    </button>
  );
  const showRest = more || used.length === 0;
  return (
    <Sheet open={open} onClose={onClose} title="Soort kiezen">
      {allowInbox && (
        <button type="button" className={`type-option wide ${value === null ? 'on' : ''}`} onClick={() => onPick(null)}>
          <TypeIcon type={null} /> <span>Inbox <small>later indelen</small></span>
        </button>
      )}
      {used.length > 0 && <div className="type-grid">{used.map(option)}</div>}
      {rest.length > 0 && used.length > 0 && (
        <button type="button" className="btn btn-ghost r-edit-toggle" aria-expanded={showRest} onClick={() => setMore(!more)}>
          <span className="empty-types-label">Andere soorten ({rest.length})</span>
          <ChevronDown size={18} className={showRest ? 'rot' : ''} />
        </button>
      )}
      {showRest && GROUPS.map((g) => {
        const list = rest.filter((t) => t.group === g.key);
        if (!list.length) return null;
        return (
          <div key={g.key} className="type-group">
            <h3>{g.label}</h3>
            <div className="type-grid">{list.map(option)}</div>
          </div>
        );
      })}
    </Sheet>
  );
}

// ---------- Velden ----------

function TextField({ def, value, onSave, id }: { def: FieldDef; value: string; onSave: (v: FieldValue) => Promise<unknown>; id: string }) {
  const [v, change, flush] = useDraft(value, (x: string) => onSave(def.kind === 'number' || def.kind === 'money' ? (x.trim() === '' ? null : Number(x.replace(',', '.'))) : x));
  const common = { id, value: v, onBlur: flush, placeholder: def.placeholder };
  if (def.kind === 'textarea') return <AutoText {...common} onChange={(e) => change(e.target.value)} minRows={2} />;
  if (def.kind === 'number' || def.kind === 'money') {
    return (
      <div className={def.kind === 'money' ? 'money' : ''}>
        {def.kind === 'money' && <span aria-hidden="true">€</span>}
        <input {...common} type="text" inputMode={def.kind === 'money' || def.step ? 'decimal' : 'numeric'} enterKeyHint="done" onChange={(e) => change(e.target.value.replace(/[^\d.,]/g, ''))} />
      </div>
    );
  }
  if (def.kind === 'url') return <input {...common} type="url" inputMode="url" enterKeyHint="done" autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(e) => change(e.target.value)} />;
  return <input {...common} type="text" enterKeyHint="done" autoCapitalize="sentences" onChange={(e) => change(e.target.value)} />;
}

/** Eigen cijfer 1–10 met hoogstens één decimaal ("7,5"). Ongeldige invoer wordt niet bewaard en krijgt een melding. */
function ScoreField({ def, value, onSave, id }: { def: FieldDef; value: FieldValue | undefined; onSave: (v: FieldValue) => Promise<unknown>; id: string }) {
  const shown = typeof value === 'number' ? formatScore(value) : '';
  const [v, setV] = useState(shown);
  const [bad, setBad] = useState(false);
  const commit = () => {
    if (v.trim() === '') { setBad(false); if (value != null) void tracked(onSave(null)); return; }
    const n = parseScore(v);
    if (n === null) { setBad(true); return; }
    setBad(false);
    setV(formatScore(n));
    if (n !== value) void tracked(onSave(n));
  };
  return (
    <div className="score-row">
      <input id={id} className="score-input" type="text" inputMode="decimal" enterKeyHint="done" value={v} placeholder={def.placeholder}
        aria-invalid={bad} aria-describedby={bad ? `${id}-err` : undefined}
        onChange={(e) => { setV(e.target.value.replace(/[^\d.,]/g, '')); setBad(false); }} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      <span className="score-max" aria-hidden="true">/ 10</span>
      {bad && <small id={`${id}-err`} className="field-error" role="alert">Vul een cijfer van 1 tot 10 in, bijv. 7,5</small>}
    </div>
  );
}

/** Meerdere korte waarden (bijv. kenmerken): chips + invoer + suggesties met één tik. */
function ListField({ id, def, item }: { id: string; def: FieldDef; item: Item }) {
  const { liveItems } = useData();
  const [v, setV] = useState('');
  const raw = item.fields[def.key];
  const values = Array.isArray(raw) ? raw : [];
  // Suggesties: vaste lijst + wat je eerder bij deze soort gebruikte.
  const suggestions = useMemo(() => {
    const used = new Map<string, number>();
    for (const i of liveItems) {
      const x = i.type === item.type ? i.fields[def.key] : null;
      if (Array.isArray(x)) for (const t of x) used.set(t, (used.get(t) ?? 0) + 1);
    }
    const all = [...new Set([...[...used.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t), ...(def.suggestions ?? [])])];
    return all.filter((t) => !values.includes(t)).slice(0, 6);
  }, [liveItems, item.type, def, values]);
  const setValues = (next: string[]) => void tracked(repo.updateItem(item.id, (cur) => ({ fields: { ...cur.fields, [def.key]: next } })));
  const add = (text: string) => {
    const parts = text.split(',').map((t) => t.trim().toLocaleLowerCase('nl')).filter((t) => t && !values.includes(t));
    setV('');
    if (parts.length) setValues([...values, ...parts]);
  };
  return (
    <div className="list-field">
      {values.length > 0 && (
        <div className="tags">
          {values.map((t) => (
            <span key={t} className="tag tag-strong">
              {t}
              <button type="button" aria-label={`${t} verwijderen`} onClick={() => setValues(values.filter((x) => x !== t))}><X size={14} /></button>
            </span>
          ))}
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); add(v); }}>
        <input id={id} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => add(v)} placeholder="Typ en druk op Enter" enterKeyHint="done" autoCapitalize="none" />
      </form>
      {suggestions.length > 0 && (
        <div className="chips">
          {suggestions.map((t) => (
            <button key={t} type="button" className="chip chip-add" onClick={() => add(t)}><Plus size={14} /> {t}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FieldEditor({ item, def }: { item: Item; def: FieldDef }) {
  const id = `f-${item.id}-${def.key}`;
  const raw = item.fields[def.key];
  const save = (v: FieldValue) => repo.setField(item.id, def.key, v);
  let control: React.ReactNode;
  switch (def.kind) {
    case 'select':
      control = (
        <div className="chips" role="radiogroup" aria-labelledby={`${id}-l`}>
          {def.options!.map((o) => (
            <button key={o.value} type="button" role="radio" aria-checked={raw === o.value} className={`chip ${raw === o.value ? 'on' : ''}`} onClick={() => void tracked(save(raw === o.value ? null : o.value))}>
              {o.label}
            </button>
          ))}
        </div>
      );
      break;
    case 'rating': {
      const n = typeof raw === 'number' ? raw : 0;
      control = (
        <div className="rating-input" role="radiogroup" aria-labelledby={`${id}-l`}>
          {[1, 2, 3, 4, 5].map((i) => (
            <button key={i} type="button" role="radio" aria-checked={n === i} aria-label={`${i} ${i === 1 ? 'ster' : 'sterren'}`} onClick={() => void tracked(save(n === i ? null : i))}>
              <Star size={26} fill={i <= n ? 'currentColor' : 'none'} className={i <= n ? 'on' : 'off'} />
            </button>
          ))}
        </div>
      );
      break;
    }
    case 'score':
      control = <ScoreField def={def} id={id} value={raw} onSave={save} />;
      break;
    case 'list':
      control = <ListField id={id} def={def} item={item} />;
      break;
    case 'boolean':
      control = (
        <label className="switch">
          <input id={id} type="checkbox" checked={raw === true} onChange={(e) => void tracked(save(e.target.checked))} />
          <span>{def.hint ?? 'Aan'}</span>
        </label>
      );
      break;
    case 'date':
      control = (
        <div className="date-row">
          <input id={id} type="date" value={typeof raw === 'string' ? raw : ''} onChange={(e) => void tracked(save(e.target.value || null))} />
          {raw ? (
            <button type="button" className="icon-btn" aria-label={`${def.label} wissen`} onClick={() => void tracked(save(null))}>
              <X size={18} />
            </button>
          ) : null}
        </div>
      );
      break;
    default:
      control = <TextField def={def} id={id} value={raw == null ? '' : String(raw)} onSave={save} />;
  }
  return (
    <div className="field">
      <label id={`${id}-l`} htmlFor={def.kind === 'select' || def.kind === 'rating' ? undefined : id}>{def.label}</label>
      {control}
      {def.hint && def.kind !== 'boolean' && <small className="hint">{def.hint}</small>}
    </div>
  );
}

/** Samenvatting van opgezochte cijfers, bijv. "Google 4,7 (1.490) · TheFork 9,0 (233) · €€". */
export function externalSummary(item: Item): string {
  const hidden = new Set(typeDef(item.type)?.fields.filter((d) => d.hidden).map((d) => d.key));
  const f = Object.fromEntries(Object.entries(item.fields).filter(([k]) => !hidden.has(k)));
  const nl = (n: unknown, d = 1) => (typeof n === 'number' ? n.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d }) : '');
  const cnt = (n: unknown) => (typeof n === 'number' ? ` (${n.toLocaleString('nl-NL')})` : '');
  return [
    typeof f.googleRating === 'number' ? `Google ${nl(f.googleRating)}${cnt(f.googleCount)}` : '',
    typeof f.theforkRating === 'number' ? `TheFork ${nl(f.theforkRating)}${cnt(f.theforkCount)}` : '',
    typeof f.tripadvisorRating === 'number' ? `Tripadvisor ${nl(f.tripadvisorRating)}${cnt(f.tripadvisorCount)}` : '',
    typeof f.priceLevel === 'string' ? f.priceLevel : '',
    f.openStatus === 'gesloten' ? 'Permanent gesloten' : f.openStatus === 'tijdelijk' ? 'Tijdelijk dicht' : '',
  ].filter(Boolean).join(' · ');
}

export function FieldsEditor({ item }: { item: Item }) {
  const def = typeDef(item.type);
  const [more, setMore] = useState(false);
  const [extOpen, setExtOpen] = useState(false);
  if (!def) return null;
  const filled = (f: FieldDef) => {
    const v = item.fields[f.key];
    return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length);
  };
  const own = shownFields(def.fields).filter((f) => !f.external);
  const ext = shownFields(def.fields).filter((f) => f.external);
  const visibleOwn = own.filter((f) => f.primary || filled(f) || more);
  const visibleExt = ext.filter((f) => filled(f) || more);
  const hidden = own.length - visibleOwn.length + (ext.length - visibleExt.length);
  const summary = externalSummary(item);
  return (
    <div className="fields">
      {visibleOwn.map((f) => <FieldEditor key={f.key} item={item} def={f} />)}
      {visibleExt.length > 0 && (
        <section className="panel panel-external fields" aria-label="Opgezochte gegevens">
          <div className="panel-label"><Info size={14} /> Opgezocht{item.fields.checkedAt ? ` op ${formatDate(String(item.fields.checkedAt))}` : ''} · niet je eigen beoordeling</div>
          {summary && <p className="ext-summary">{summary}</p>}
          {typeof item.fields.uncertain === 'string' && item.fields.uncertain && !(extOpen || more) && <p className="ext-uncertain">{item.fields.uncertain}</p>}
          {extOpen || more ? (
            visibleExt.map((f) => <FieldEditor key={f.key} item={item} def={f} />)
          ) : (
            <button type="button" className="btn btn-small" onClick={() => setExtOpen(true)}>Details en bron bewerken</button>
          )}
        </section>
      )}
      {hidden > 0 && (
        <button type="button" className="btn btn-ghost" onClick={() => setMore(true)}>
          <Plus size={18} /> Meer velden ({hidden})
        </button>
      )}
    </div>
  );
}

// ---------- Checklist ----------

function EntryRow({ e, onToggle, onText, onRemove }: { e: ChecklistEntry; onToggle: () => void; onText: (t: string) => Promise<unknown>; onRemove: () => void }) {
  const [v, change, flush] = useDraft(e.text, onText);
  return (
    <li className={`entry ${e.done ? 'done' : ''}`}>
      <button type="button" className="check" role="checkbox" aria-checked={e.done} aria-label={e.text || 'Punt'} onClick={onToggle}>
        {e.done && <Check size={18} strokeWidth={3} />}
      </button>
      <input value={v} onChange={(ev) => change(ev.target.value)} onBlur={flush} aria-label="Tekst van punt" enterKeyHint="done" />
      <button type="button" className="icon-btn subtle" aria-label={`${e.text} verwijderen`} onClick={onRemove}>
        <X size={18} />
      </button>
    </li>
  );
}

export function ChecklistEditor({ item }: { item: Item }) {
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const list = item.checklist;
  const done = list.filter((e) => e.done).length;
  const isTemplate = item.type === 'packing' && item.fields.isTemplate === true;

  const add = async () => {
    const lines = draft.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    setDraft('');
    await tracked(repo.updateItem(item.id, (cur) => ({ checklist: [...cur.checklist, ...lines.map((l) => repo.entry(l))] })));
  };
  const setAll = (patch: (l: ChecklistEntry[]) => ChecklistEntry[], msg: string) => {
    const before = list;
    void tracked(repo.updateItem(item.id, (cur) => ({ checklist: patch(cur.checklist) })));
    toast(msg, { action: { label: 'Ongedaan maken', run: () => void repo.updateItem(item.id, { checklist: before }) } });
  };

  return (
    <div className="checklist">
      <div className="checklist-head">
        <span>{list.length ? `${done} van ${list.length} afgevinkt` : 'Nog geen punten'}</span>
      </div>
      <ul>
        {list.map((e) => (
          <EntryRow
            key={e.id}
            e={e}
            onToggle={() => void tracked(repo.toggleEntry(item.id, e.id))}
            onText={(t) => repo.updateItem(item.id, (cur) => ({ checklist: cur.checklist.map((x) => (x.id === e.id ? { ...x, text: t } : x)) }))}
            onRemove={() => setAll((l) => l.filter((x) => x.id !== e.id), `"${e.text}" verwijderd`)}
          />
        ))}
      </ul>
      <form className="entry-add" onSubmit={(ev) => { ev.preventDefault(); void add(); }}>
        <Plus size={20} aria-hidden="true" />
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Punt toevoegen" aria-label="Punt toevoegen" enterKeyHint="enter" onBlur={() => void add()} />
      </form>
      {done > 0 && (
        <div className="row-wrap">
          <button type="button" className="btn btn-small" onClick={() => setAll((l) => l.map((x) => ({ ...x, done: false })), 'Alle punten weer open')}>
            <RotateCcw size={16} /> Alles weer open
          </button>
          {!isTemplate && (
            <button type="button" className="btn btn-small" onClick={() => setAll((l) => l.filter((x) => !x.done), 'Afgevinkte punten verwijderd')}>
              <X size={16} /> Afgevinkte verwijderen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Tags ----------

export function TagEditor({ item }: { item: Item }) {
  const { liveItems } = useData();
  const [v, setV] = useState('');
  const known = useMemo(() => [...new Set(liveItems.flatMap((i) => i.tags))].sort(), [liveItems]);
  const add = () => {
    const t = v.trim().replace(/^#/, '').toLowerCase();
    setV('');
    if (!t || item.tags.includes(t)) return;
    void tracked(repo.updateItem(item.id, (cur) => ({ tags: [...cur.tags, t] })));
  };
  return (
    <div className="tags">
      {item.tags.map((t) => (
        <span key={t} className="tag">
          #{t}
          <button type="button" aria-label={`Tag ${t} verwijderen`} onClick={() => void tracked(repo.updateItem(item.id, (cur) => ({ tags: cur.tags.filter((x) => x !== t) })))}>
            <X size={14} />
          </button>
        </span>
      ))}
      <form onSubmit={(e) => { e.preventDefault(); add(); }} className="tag-add">
        <input value={v} onChange={(e) => setV(e.target.value)} onBlur={add} placeholder="Tag toevoegen" aria-label="Tag toevoegen" list="known-tags" enterKeyHint="done" autoCapitalize="none" />
        <datalist id="known-tags">{known.map((t) => <option key={t} value={t} />)}</datalist>
      </form>
    </div>
  );
}

// ---------- Koppelingen ----------

export function LinkPicker({ open, onClose, exclude, onPick }: { open: boolean; onClose: () => void; exclude: string; onPick: (item: Item) => void }) {
  const data = useData();
  const [q, setQ] = useState('');
  const hits = useMemo(
    () => search({ items: data.liveItems, sources: [], links: data.links }, q, { kind: 'items' }).hits.slice(0, 30),
    [data, q],
  );
  return (
    <Sheet open={open} onClose={onClose} title="Koppelen aan item">
      <div className="search-box">
        <SearchIcon size={18} aria-hidden="true" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek een item" aria-label="Zoek een item" enterKeyHint="search" />
      </div>
      <ul className="pick-list">
        {hits.map((h) => h.kind === 'item' && h.item.id !== exclude && (
          <li key={h.item.id}>
            <button type="button" onClick={() => onPick(h.item)}>
              <TypeIcon type={h.item.type} /> <span>{h.item.title || 'Zonder titel'}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

export function LinksSection({ kind, id }: { kind: EntityKind; id: string }) {
  const toast = useToast();
  const linked = useLinked(id);
  const [picking, setPicking] = useState(false);
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);

  const unlink = (linkId: string, label: string) => {
    void repo.unlink(linkId);
    toast(`Koppeling met "${label}" verwijderd`, {
      action: { label: 'Ongedaan maken', run: async () => { const l = await db.links.get(linkId); if (l) await db.links.put({ ...l, deletedAt: null }); } },
    });
  };
  const addUrl = async () => {
    const u = findUrl(url) ?? (isUrl(url) ? url : null);
    if (!u) { toast('Dat lijkt geen geldige link', { tone: 'error' }); return; }
    const { source, existed } = await repo.addSource({ url: u });
    await repo.linkRecords(kind, id, 'source', source.id);
    setUrl('');
    setAdding(false);
    toast(existed ? 'Bestaande bron gekoppeld (niet dubbel opgeslagen)' : 'Link bewaard en gekoppeld');
  };

  return (
    <div className="links">
      {kind === 'item' && linked.sources.map(({ link, source }) => (
        <div key={link.id} className="link-row">
          <button type="button" className="link-main" onClick={() => navigate(`/bron/${source.id}`)}>
            <TypeIcon type={null} source size={18} />
            <span><b>{source.title || source.site}</b><small>{source.site}</small></span>
          </button>
          <a className="icon-btn" href={source.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${source.site}`}>
            <ExternalLink size={18} />
          </a>
          <button type="button" className="icon-btn subtle" aria-label="Koppeling verwijderen" onClick={() => unlink(link.id, source.title || source.site)}>
            <X size={18} />
          </button>
        </div>
      ))}
      {linked.items.map(({ link, item }) => (
        <div key={link.id} className="link-row">
          <button type="button" className="link-main" onClick={() => navigate(`/item/${item.id}`)}>
            <TypeIcon type={item.type} size={18} />
            <span><b>{item.title || 'Zonder titel'}</b><small>{typeDef(item.type)?.label ?? 'Inbox'}</small></span>
          </button>
          <button type="button" className="icon-btn subtle" aria-label="Koppeling verwijderen" onClick={() => unlink(link.id, item.title)}>
            <X size={18} />
          </button>
        </div>
      ))}
      {adding && kind === 'item' && (
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); void addUrl(); }}>
          <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-label="Link" autoFocus enterKeyHint="done" />
          <button type="submit" className="btn btn-primary btn-small">Bewaar</button>
        </form>
      )}
      <div className="row-wrap">
        {kind === 'item' && !adding && (
          <button type="button" className="btn btn-small" onClick={() => setAdding(true)}><Plus size={16} /> Link</button>
        )}
        <button type="button" className="btn btn-small" onClick={() => setPicking(true)}><Plus size={16} /> Koppel item</button>
      </div>
      <LinkPicker
        open={picking}
        onClose={() => setPicking(false)}
        exclude={id}
        onPick={async (other) => {
          setPicking(false);
          await repo.linkRecords(kind, id, 'item', other.id);
          toast(`Gekoppeld aan "${other.title}"`);
        }}
      />
    </div>
  );
}

// ---------- Geschiedenis ----------

function diffLines(snap: Item | Source, cur: Item | Source): string[] {
  const out: string[] = [];
  if (snap.title !== cur.title) out.push(`Titel: ${snap.title || '—'}`);
  if ('fields' in snap && 'fields' in cur) {
    const def = typeDef(cur.type);
    for (const f of def?.fields ?? []) {
      const a = snap.fields[f.key] ?? '';
      const b = cur.fields[f.key] ?? '';
      if (String(a) !== String(b)) {
        const label = f.options?.find((o) => o.value === a)?.label ?? (typeof a === 'boolean' ? (a ? 'ja' : 'nee') : Array.isArray(a) ? a.join(', ') : a);
        out.push(`${f.label}: ${label === '' ? '—' : label}`);
      }
    }
    if (snap.type !== cur.type) out.push(`Soort: ${typeDef(snap.type)?.label ?? 'Inbox'}`);
    if (snap.body !== cur.body) out.push('Notities waren anders');
    if (JSON.stringify(snap.checklist) !== JSON.stringify(cur.checklist)) out.push(`Checklist: ${snap.checklist.filter((e) => e.done).length}/${snap.checklist.length} afgevinkt`);
    if (snap.tags.join() !== cur.tags.join()) out.push(`Tags: ${snap.tags.map((t) => '#' + t).join(' ') || '—'}`);
  } else if ('note' in snap && 'note' in cur) {
    if (snap.url !== cur.url) out.push(`Link: ${snap.url}`);
    if (snap.description !== cur.description) out.push('Beschrijving was anders');
    if (snap.note !== cur.note) out.push('Eigen notitie was anders');
  }
  return out;
}

export function HistorySection({ current }: { current: Item | Source }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const revs = useLiveQuery(() => db.revisions.where('entityId').equals(current.id).toArray(), [current.id]) ?? [];
  const sorted = [...revs].sort((a, b) => b.changedAt.localeCompare(a.changedAt));
  const withDiff = sorted.map((r) => ({ r, lines: diffLines(r.snapshot, current) })).filter((x) => x.lines.length);
  if (!withDiff.length) return null;
  const restore = async (r: Revision) => {
    await tracked(repo.restoreRevision(r.id));
    toast('Eerdere versie teruggezet (de huidige staat in de geschiedenis)');
  };
  return (
    <div className="history">
      <button type="button" className="btn btn-ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
        <History size={18} /> Eerdere versies ({withDiff.length})
      </button>
      {open && (
        <ol>
          {withDiff.map(({ r, lines }) => (
            <li key={r.id}>
              <div className="history-when">Tot {formatDateTime(r.changedAt)}</div>
              <ul>{lines.map((l) => <li key={l}>{l}</li>)}</ul>
              <button type="button" className="btn btn-small" onClick={() => void restore(r)}><RotateCcw size={16} /> Terugzetten</button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ---------- Opslagstatus ----------

export function SaveStatus() {
  const s = useSaveState();
  if (s === 'idle') return null;
  return (
    <span className={`save-status s-${s}`} role="status">
      {s === 'pending' && 'Opslaan…'}
      {s === 'saved' && (<><Check size={14} /> Opgeslagen</>)}
      {s === 'error' && (<><CircleAlert size={14} /> Niet opgeslagen</>)}
    </span>
  );
}

