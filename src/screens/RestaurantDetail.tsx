// Sober restaurantdetail: eerst wat je wilt weten (naam, je cijfer, favoriet, waar, wat), dan website/route,
// de samenvatting (ingekort), je notities, en de gegevens zelf pas na "Gegevens bewerken".
import { ChevronDown, ExternalLink, Globe, Heart, Navigation } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { FieldEditor } from '../components/editors';
import { AutoText, Section } from '../components/ui';
import { fieldDef } from '../data/itemTypes';
import type { Item } from '../data/model';
import * as repo from '../data/repo';
import { formatDate, formatScore, parseScore } from '../data/util';
import { tracked } from '../ui/draft';

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

/** Google Maps-zoeklink (gewone link, geen sleutel nodig). Op Android opent de Maps-app. */
export function routeUrl(item: Item): string | null {
  const where = str(item.fields.address) || str(item.fields.city);
  if (!where) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.title}, ${where}`)}`;
}

function ScoreBox({ item }: { item: Item }) {
  const value = typeof item.fields.score === 'number' ? item.fields.score : null;
  const [v, setV] = useState(value === null ? '' : formatScore(value));
  const [bad, setBad] = useState(false);
  const commit = () => {
    if (v.trim() === '') { setBad(false); if (value !== null) void tracked(repo.setField(item.id, 'score', null)); return; }
    const n = parseScore(v);
    if (n === null) { setBad(true); return; }
    setBad(false);
    setV(formatScore(n));
    if (n !== value) void tracked(repo.setField(item.id, 'score', n));
  };
  return (
    <>
      <label className="r-scorebox">
        <input type="text" inputMode="decimal" enterKeyHint="done" value={v} placeholder="–" aria-label="Mijn cijfer (1 tot 10)"
          aria-invalid={bad} aria-describedby={bad ? 'score-err' : undefined}
          onChange={(e) => { setV(e.target.value.replace(/[^\d.,]/g, '')); setBad(false); }} onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        <small aria-hidden="true">Mijn cijfer</small>
      </label>
      {bad && <p id="score-err" className="field-error r-score-err" role="alert">Vul een cijfer van 1 tot 10 in, bijv. 7,5</p>}
    </>
  );
}

function Summary({ item }: { item: Item }) {
  const text = str(item.fields.summary);
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [text, open]);
  if (!text) return null;
  const by = item.filledBy?.fields.includes('summary') || item.origin?.system === 'claude' || item.fields.checkedAt ? 'Door Claude geschreven' : 'Samenvatting';
  return (
    <div className="summary-box">
      <p ref={ref} className={open ? '' : 'clamp-3'}>{text}</p>
      <div className="summary-foot">
        <small>{by}{item.fields.checkedAt ? ` · ${formatDate(String(item.fields.checkedAt))}` : ''}</small>
        {(clamped || open) && (
          <button type="button" className="btn btn-small btn-ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Minder' : 'Meer lezen'}</button>
        )}
      </div>
    </div>
  );
}

export function RestaurantBody({ item, title, setTitle, flushTitle, body, setBody, flushBody }: {
  item: Item;
  title: string; setTitle: (v: string) => void; flushTitle: () => void;
  body: string; setBody: (v: string) => void; flushBody: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const f = item.fields;
  const fav = f.favorite === true;
  const sub = [str(f.city), str(f.cuisine)].filter(Boolean).join(' · ');
  const traits = Array.isArray(f.traits) ? f.traits : [];
  const website = /^https?:\/\//i.test(str(f.website)) ? str(f.website) : '';
  const route = routeUrl(item);
  const editKeys = ['city', 'cuisine', 'traits', 'address', ...(str(f.dishes) ? ['dishes'] : [])];

  return (
    <>
      <div className="r-head">
        <AutoText className="title-input r-title" value={title} onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))} onBlur={flushTitle} placeholder="Naam van het restaurant" aria-label="Naam" minRows={1} enterKeyHint="done" />
        <button type="button" className={`icon-btn r-fav ${fav ? 'on' : ''}`} aria-pressed={fav} aria-label="Favoriet" onClick={() => void tracked(repo.setField(item.id, 'favorite', fav ? null : true))}>
          <Heart size={24} fill={fav ? 'currentColor' : 'none'} />
        </button>
        <ScoreBox key={String(f.score ?? '')} item={item} />
      </div>
      {(sub || traits.length > 0) && (
        <div className="r-info">
          {sub && <p className="r-sub">{sub}</p>}
          {traits.length > 0 && <ul className="r-tags" aria-label="Labels">{traits.map((t) => <li key={t}>{t}</li>)}</ul>}
        </div>
      )}
      {(website || route) && (
        <div className="r-actions">
          {website && (
            <a className="btn" href={website} target="_blank" rel="noopener noreferrer" aria-label={`Website ${hostOf(website)}`}>
              <Globe size={18} aria-hidden="true" /> Website <ExternalLink size={14} aria-hidden="true" />
            </a>
          )}
          {route && (
            <a className="btn" href={route} target="_blank" rel="noopener noreferrer" aria-label="Route in Google Maps">
              <Navigation size={18} aria-hidden="true" /> Route <ExternalLink size={14} aria-hidden="true" />
            </a>
          )}
        </div>
      )}
      <Summary item={item} />
      <Section title="Mijn notities">
        <AutoText value={body} onChange={(e) => setBody(e.target.value)} onBlur={flushBody} placeholder="Wat at je, met wie, wat wil je onthouden?" aria-label="Mijn notities" minRows={3} />
      </Section>
      <button type="button" className="btn btn-ghost r-edit-toggle" aria-expanded={editing} onClick={() => setEditing(!editing)}>
        Gegevens bewerken <ChevronDown size={18} className={editing ? 'rot' : ''} />
      </button>
      {editing && (
        <div className="fields">
          {editKeys.map((k) => { const d = fieldDef('restaurant', k); return d ? <FieldEditor key={k} item={item} def={d} /> : null; })}
        </div>
      )}
    </>
  );
}
