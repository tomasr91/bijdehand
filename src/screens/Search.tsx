import { ChevronDown, Search as SearchIcon, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ItemCard, SourceCard } from '../components/cards';
import { TypePicker } from '../components/editors';
import { ChipGroup, Empty, Segmented, TopBar, TypeIcon } from '../components/ui';
import { isTypeKey, statusOptions as statusOptions_, TYPE_MAP } from '../data/itemTypes';
import type { TypeKey } from '../data/model';
import { search, type SearchFilters } from '../data/search';
import { useData } from '../ui/context';
import { currentPath, navigate, type Route } from '../ui/router';

const EXAMPLES = [
  'Welke cadeaus had ik voor mijn partner bedacht?',
  'Welke restaurants wilde ik nog proberen?',
  'Welke games staan nog op mijn verlanglijst?',
  'Welke klussen moeten nog gebeuren?',
];

export function SearchScreen({ route }: { route: Route }) {
  const data = useData();
  const q0 = route.query.get('q') ?? '';
  const t0 = route.query.get('type');
  const [q, setQ] = useState(q0);
  const [kind, setKind] = useState<NonNullable<SearchFilters['kind']>>('all');
  const [type, setType] = useState<TypeKey | 'inbox' | ''>(t0 === 'inbox' ? 'inbox' : isTypeKey(t0) ? t0 : '');
  const [status, setStatus] = useState('');
  const [tag, setTag] = useState('');
  const [picking, setPicking] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Zoekterm in de URL, zodat "terug" vanaf een resultaat de zoekopdracht bewaart.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const p = new URLSearchParams();
      if (q) p.set('q', q);
      if (type) p.set('type', type);
      const next = `/zoeken${p.toString() ? '?' + p : ''}`;
      if (currentPath() !== next) navigate(next, { replace: true });
    }, 300);
    return () => window.clearTimeout(t);
  }, [q, type]);

  useEffect(() => {
    if (!q0 && window.matchMedia('(min-width: 900px)').matches) input.current?.focus();
  }, [q0]);

  const tags = useMemo(() => [...new Set(data.liveItems.flatMap((i) => i.tags))].sort(), [data.liveItems]);
  const filters: SearchFilters = { kind: type ? 'items' : kind, type: type || undefined, status: status || undefined, tag: tag || undefined };
  const active = !!(q.trim() || type || tag || kind !== 'all');
  const result = useMemo(() => (active ? search(data, q, filters) : null), [data, q, kind, type, status, tag]); // eslint-disable-line react-hooks/exhaustive-deps
  const tdef = type && type !== 'inbox' ? TYPE_MAP[type] : undefined;
  const statusOptions = statusOptions_(tdef);

  return (
    <div className="screen">
      <TopBar back={type && type !== 'inbox' ? `/verzameling/${type}` : '/verzamelingen'} title="Zoeken" />
      <form className="search-box big" role="search" onSubmit={(e) => { e.preventDefault(); input.current?.blur(); }}>
        <SearchIcon size={20} aria-hidden="true" />
        <input ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek of stel een vraag" aria-label="Zoeken" enterKeyHint="search" />
        {q && <button type="button" className="icon-btn subtle" aria-label="Wissen" onClick={() => { setQ(''); input.current?.focus(); }}><X size={18} /></button>}
      </form>

      <div className="filters">
        {!type && (
          <Segmented label="Wat doorzoeken" value={kind} onChange={setKind} options={[{ value: 'all', label: 'Alles' }, { value: 'items', label: 'Items' }, { value: 'sources', label: 'Bronnen' }]} />
        )}
        <div className="row-wrap">
          <button type="button" className={`type-select ${type ? 'on' : ''}`} onClick={() => setPicking(true)}>
            {type ? <TypeIcon type={type === 'inbox' ? null : type} size={16} /> : null}
            <span>{type === 'inbox' ? 'Inbox' : tdef?.plural ?? 'Alle soorten'}</span>
            <ChevronDown size={16} />
          </button>
          {type && <button type="button" className="btn btn-small" onClick={() => { setType(''); setStatus(''); }}><X size={16} /> Soort wissen</button>}
        </div>
        {statusOptions.length > 0 && (
          <ChipGroup label="Status" value={status} onChange={setStatus} options={[{ value: '', label: 'Elke status' }, ...statusOptions.map((o) => ({ value: o.value, label: o.label }))]} />
        )}
        {tags.length > 0 && (kind !== 'sources' || type) && (
          <ChipGroup label="Tag" value={tag} onChange={setTag} options={[{ value: '', label: 'Elke tag' }, ...tags.map((t) => ({ value: t, label: `#${t}` }))]} />
        )}
      </div>

      {!result ? (
        <div className="examples">
          <p className="eyebrow">Probeer bijvoorbeeld</p>
          {EXAMPLES.map((e) => <button key={e} type="button" className="example" onClick={() => setQ(e)}>{e}</button>)}
          <p className="footnote">Zoeken werkt op woorden en filters. Vragen in gewone taal worden nog niet echt begrepen; vraagwoorden worden genegeerd.</p>
        </div>
      ) : result.hits.length === 0 ? (
        <Empty title="Niets gevonden" text={result.terms.length ? `Gezocht op: ${result.terms.join(', ')}` : undefined} />
      ) : (
        <>
          <p className="result-count">
            {result.hits.length} {result.hits.length === 1 ? 'resultaat' : 'resultaten'}
            {result.partial && ' · geen exacte treffer, dit zijn gedeeltelijke overeenkomsten'}
          </p>
          <div className="list">
            {result.hits.slice(0, 200).map((h) => (h.kind === 'item' ? <ItemCard key={h.item.id} item={h.item} /> : <SourceCard key={h.source.id} source={h.source} />))}
          </div>
        </>
      )}

      <TypePicker
        open={picking}
        value={type === 'inbox' ? null : (type || null)}
        onClose={() => setPicking(false)}
        onPick={(t) => { setType(t === null ? 'inbox' : t); setStatus(''); setPicking(false); }}
      />
    </div>
  );
}
