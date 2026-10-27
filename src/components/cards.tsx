import { Check, Heart, Lightbulb } from 'lucide-react';
import { isDone, optionLabel, statusOf, typeDef } from '../data/itemTypes';
import type { Item, Source } from '../data/model';
import { dayOf, formatDate, formatScore } from '../data/util';
import { navigate } from '../ui/router';
import { Stars, TypeIcon } from './ui';

/** Korte samenvatting per soort: de velden die je in een lijst wilt zien. */
export function summary(item: Item): string[] {
  const f = item.fields;
  const s = (k: string) => (typeof f[k] === 'string' ? (f[k] as string).trim() : '');
  const status = item.type && statusOf(item) ? optionLabel(item.type, typeDef(item.type)!.statusKey!, statusOf(item)!) : '';
  switch (item.type) {
    case 'restaurant':
    case 'activity':
    case 'date': {
      // Sober: naam, hoogstens 3 kenmerken, rechts cijfer en hartje (PlaceMark). Geen status: het cijfer zegt of je er was.
      return [traitsLine(item), f.openStatus === 'gesloten' ? 'Permanent gesloten' : ''];
    }
    case 'album': return [s('artist'), status];
    case 'packing': {
      const done = item.checklist.filter((e) => e.done).length;
      return [`${done} van ${item.checklist.length} ingepakt`];
    }
    default: {
      const first = item.body.split('\n').find((l) => l.trim()) ?? '';
      const list = item.checklist.length ? `${item.checklist.length} punten` : '';
      return [first, list];
    }
  }
}

/** Labels van een restaurant: "Fine dining" (alleen die soort zaak) komt eerst, daarna de kenmerken (keuken, vega, …). */
export const FINE_DINING = 'fine dining';
export function labelsOf(item: Item): string[] {
  const t = Array.isArray(item.fields.traits) ? item.fields.traits.filter((x): x is string => typeof x === 'string') : [];
  const rest = t.filter((x) => x.toLowerCase() !== FINE_DINING.toLowerCase());
  return item.fields.venue === 'finedining' ? [FINE_DINING, ...rest] : rest;
}

/** "Fine dining, frans, set menu": de eerste `max` labels (de volgorde zegt wat het belangrijkst is, zie docs/INDELEN.md). */
export function traitsLine(item: Item, max = 3): string {
  const line = labelsOf(item).slice(0, max).join(', ');
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** Rechts op een restaurantrij: hartje (favoriet) en je eigen cijfer; vinkje bij "geweest" zonder cijfer; anders niets. */
export function PlaceMark({ item }: { item: Item }) {
  const f = item.fields;
  const fav = f.favorite === true;
  const score = typeof f.score === 'number' ? f.score : null;
  if (!fav && score === null && f.visited !== true) return null;
  return (
    <span className="r-mark">
      {fav && <Heart size={16} fill="currentColor" strokeWidth={0} className="r-heart" role="img" aria-label="Favoriet" />}
      {score !== null ? (
        <span className="r-score-val" aria-label={`Mijn cijfer ${formatScore(score)}`}>{formatScore(score)}</span>
      ) : f.visited === true ? (
        <Check size={18} className="r-visited" role="img" aria-label="Geweest" />
      ) : null}
    </span>
  );
}

/** Eén restaurantkaart: naam, daaronder de eerste drie labels. Rechts hartje en cijfer. */
export function PlaceRow({ item }: { item: Item }) {
  const traits = traitsLine(item, 3);
  const closed = item.fields.openStatus === 'gesloten';
  const sub = [closed ? 'Permanent gesloten' : '', traits].filter(Boolean).join(' · ');
  return (
    <button type="button" className="r-row" onClick={() => navigate(`/item/${item.id}`)}>
      <span className="r-row-text">
        <span className="r-row-title">{item.title || 'Zonder titel'}</span>
        {sub && <span className="r-row-sub">{sub}</span>}
      </span>
      <PlaceMark item={item} />
    </button>
  );
}

export function ItemCard({ item, showType = true }: { item: Item; showType?: boolean }) {
  const parts = summary(item).filter(Boolean);
  const rating = typeof item.fields.rating === 'number' ? item.fields.rating : 0;
  const done = isDone(item);
  return (
    <div className={`card ${done ? 'card-done' : ''}`}>
      <button type="button" className="card-main" onClick={() => navigate(`/item/${item.id}`)}>
        {showType && <TypeIcon type={item.type} />}
        <span className="card-text">
          <span className="card-title">{item.title || 'Zonder titel'}</span>
          {(parts.length > 0 || rating > 0) && (
            <span className="card-sub">
              {rating > 0 && <Stars value={rating} small />}
              {parts.join(' · ')}
            </span>
          )}
          {item.type === null && item.suggestion && (
            <span className="card-suggest">
              <Lightbulb size={14} /> Voorstel: {typeDef(item.suggestion.type)?.label}
            </span>
          )}
          {item.type === 'packing' && item.checklist.length > 0 && (
            <span className="progress" aria-hidden="true">
              <span style={{ width: `${(item.checklist.filter((e) => e.done).length / item.checklist.length) * 100}%` }} />
            </span>
          )}
        </span>
        {typeDef(item.type)?.place && <PlaceMark item={item} />}
      </button>
    </div>
  );
}

export function SourceCard({ source, linkedCount }: { source: Source; linkedCount?: number }) {
  const note = source.note.split('\n')[0];
  return (
    <div className="card">
      <button type="button" className="card-main" onClick={() => navigate(`/bron/${source.id}`)}>
        <TypeIcon type={null} source />
        <span className="card-text">
          <span className="card-title">{source.title || source.site || source.url}</span>
          <span className="card-sub">
            {[source.site, `bewaard ${formatDate(dayOf(source.createdAt))}`, linkedCount ? `${linkedCount} gekoppeld` : ''].filter(Boolean).join(' · ')}
          </span>
          {note && <span className="card-note">“{note}”</span>}
        </span>
      </button>
    </div>
  );
}
