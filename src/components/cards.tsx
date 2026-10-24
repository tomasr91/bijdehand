import { Check, Droplets, Heart, Lightbulb } from 'lucide-react';
import { isDone, optionLabel, statusOf, typeDef } from '../data/itemTypes';
import type { Item, Source } from '../data/model';
import { markPlantCared, setField } from '../data/repo';
import { dayOf, daysBetween, formatDate, formatScore, localDate, relativeDay } from '../data/util';
import { useToast } from '../ui/context';
import { navigate } from '../ui/router';
import { Stars, TypeIcon } from './ui';

const euro = (v: unknown) => (typeof v === 'number' && v > 0 ? `€ ${v.toLocaleString('nl-NL')}` : '');

/** Korte samenvatting per soort: de velden die je in een lijst wilt zien. */
export function summary(item: Item): string[] {
  const f = item.fields;
  const s = (k: string) => (typeof f[k] === 'string' ? (f[k] as string).trim() : '');
  const status = item.type && statusOf(item) ? optionLabel(item.type, typeDef(item.type)!.statusKey!, statusOf(item)!) : '';
  switch (item.type) {
    case 'gift': return [s('person'), s('occasion'), euro(f.budget), status];
    case 'trip': return [s('destination'), s('price'), status];
    case 'restaurant': {
      // Sober: naam, hoogstens 3 kenmerken, rechts cijfer en hartje (RestaurantMark). Geen status: het cijfer zegt of je er was.
      return [traitsLine(item), f.openStatus === 'gesloten' ? 'Permanent gesloten' : ''];
    }
    case 'book': return [s('author'), status];
    case 'album': return [s('artist'), status];
    case 'game': return [s('platform'), status];
    case 'size': return [[s('garment'), s('size')].filter(Boolean).join(': '), s('brand'), f.date ? formatDate(String(f.date)) : ''];
    case 'packing': {
      const done = item.checklist.filter((e) => e.done).length;
      return [f.isTemplate ? 'Basislijst' : '', `${done}/${item.checklist.length} ingepakt`, f.tripDate ? relativeDay(String(f.tripDate)) : ''];
    }
    case 'todo': return [status, s('priority') === 'hoog' ? 'Hoge prioriteit' : '', f.due ? `Deadline ${relativeDay(String(f.due))}` : ''];
    case 'plant': return [s('location'), f.nextCare ? `Verzorgen ${relativeDay(String(f.nextCare))}` : ''];
    default: {
      const first = item.body.split('\n').find((l) => l.trim()) ?? '';
      const list = item.checklist.length ? `${item.checklist.length} punten` : '';
      return [first, list];
    }
  }
}

function dueTone(item: Item): string {
  const date = item.type === 'todo' ? item.fields.due : item.type === 'plant' ? item.fields.nextCare : null;
  if (typeof date !== 'string' || !date || isDone(item)) return '';
  const diff = daysBetween(localDate(), date);
  return diff < 0 ? 'tone-late' : diff === 0 ? 'tone-today' : '';
}

/** "fancy, reserveren, terras +2": hoogstens `max` kenmerken. */
export function traitsLine(item: Item, max = 3): string {
  const t = Array.isArray(item.fields.traits) ? item.fields.traits : [];
  return t.length > max ? `${t.slice(0, max).join(', ')} +${t.length - max}` : t.join(', ');
}

/** Rechts op een restaurantrij: hartje (favoriet) en je eigen cijfer; vinkje bij "geweest" zonder cijfer; anders niets. */
export function RestaurantMark({ item }: { item: Item }) {
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

/** Eén regel in de restaurantlijst (binnen een blok per plaats). */
export function RestaurantRow({ item }: { item: Item }) {
  const traits = traitsLine(item);
  const closed = item.fields.openStatus === 'gesloten';
  return (
    <button type="button" className="r-row" onClick={() => navigate(`/item/${item.id}`)}>
      <span className="r-row-text">
        <span className="r-row-title">{item.title || 'Zonder titel'}</span>
        {(traits || closed) && <span className="r-row-sub">{[closed ? 'Permanent gesloten' : '', traits].filter(Boolean).join(' · ')}</span>}
      </span>
      <RestaurantMark item={item} />
    </button>
  );
}

export function ItemCard({ item, showType = true, quick = true }: { item: Item; showType?: boolean; quick?: boolean }) {
  const toast = useToast();
  const parts = summary(item).filter(Boolean);
  const rating = typeof item.fields.rating === 'number' ? item.fields.rating : 0;
  const done = isDone(item);
  const quickAction =
    !quick ? null
    : item.type === 'todo' && !done ? (
      <button
        type="button"
        className="card-quick"
        aria-label={`${item.title} afronden`}
        onClick={async (e) => {
          e.stopPropagation();
          const prev = statusOf(item) ?? 'open';
          await setField(item.id, 'status', 'klaar');
          toast('Klus afgerond', { action: { label: 'Ongedaan maken', run: () => void setField(item.id, 'status', prev) } });
        }}
      >
        <Check size={20} />
      </button>
    ) : item.type === 'plant' && item.fields.nextCare ? (
      <button
        type="button"
        className="card-quick"
        aria-label={`${item.title} verzorgd`}
        onClick={async (e) => {
          e.stopPropagation();
          const prev = { nextCare: item.fields.nextCare ?? null, lastCare: item.fields.lastCare ?? null };
          await markPlantCared(item.id);
          toast(`${item.title} verzorgd`, { action: { label: 'Ongedaan maken', run: async () => { await setField(item.id, 'nextCare', prev.nextCare); await setField(item.id, 'lastCare', prev.lastCare); } } });
        }}
      >
        <Droplets size={20} />
      </button>
    ) : null;

  return (
    <div className={`card ${done ? 'card-done' : ''}`}>
      <button type="button" className="card-main" onClick={() => navigate(`/item/${item.id}`)}>
        {showType && <TypeIcon type={item.type} />}
        <span className="card-text">
          <span className="card-title">{item.title || 'Zonder titel'}</span>
          {(parts.length > 0 || rating > 0) && (
            <span className={`card-sub ${dueTone(item)}`}>
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
        {item.type === 'restaurant' && <RestaurantMark item={item} />}
      </button>
      {quickAction}
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
