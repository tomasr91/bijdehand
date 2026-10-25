// Restaurantlijst: één filterrij (geweest of niet), labels via de filterknop, per plaats een blok met rijen.
// Belangrijkste eerst: favorieten, dan je cijfer (hoog → laag), dan waar je nog niet was.
import { ChevronDown, ClipboardPaste, List, ListFilter, Map as MapIcon, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { labelsOf, RestaurantRow } from '../components/cards';
import { BrandHeader, BrandPanel, ChipGroup, Empty, Section, Segmented, Sheet, TypeIcon } from '../components/ui';
import { hasBeen, TYPE_MAP } from '../data/itemTypes';
import type { Item } from '../data/model';
import { fold } from '../data/util';
import { useAdd, useData, useToast } from '../ui/context';
import { geocodeMissing, hasLocation, needsGeocode } from '../data/geocode';
import { MapLegend, RestaurantMap } from './RestaurantMap';
import { navigate } from '../ui/router';
import { PasteSheet } from './PasteSheet';

type Seen = 'alle' | 'niet' | 'geweest';

const traitsOf = labelsOf;

/** Favorieten, dan cijfer hoog → laag, dan "geweest" zonder cijfer, dan nog niet geweest; binnen gelijk op naam. */
export function sortRestaurants(list: Item[]): Item[] {
  const rank = (i: Item) => (i.fields.favorite === true ? 0 : typeof i.fields.score === 'number' ? 1 : hasBeen(i) ? 2 : 3);
  const score = (i: Item) => (typeof i.fields.score === 'number' ? i.fields.score : -1);
  return [...list].sort((a, b) => rank(a) - rank(b) || score(b) - score(a) || a.title.localeCompare(b.title, 'nl'));
}

/** Per plaats (hoofdletterongevoelig), grootste plaats eerst; "Plaats onbekend" achteraan. */
export function groupByCity(list: Item[]): { title: string; items: Item[] }[] {
  const m = new Map<string, { title: string; items: Item[] }>();
  for (const i of list) {
    const label = String(i.fields.city ?? '').trim();
    const key = label ? fold(label) : '';
    const g = m.get(key) ?? { title: label || 'Plaats onbekend', items: [] };
    g.items.push(i);
    m.set(key, g);
  }
  return [...m.entries()]
    .sort(([ka, a], [kb, b]) => Number(ka === '') - Number(kb === '') || b.items.length - a.items.length || a.title.localeCompare(b.title, 'nl'))
    .map(([, g]) => ({ ...g, items: sortRestaurants(g.items) }));
}

export function RestaurantCollection() {
  const { liveItems } = useData();
  const add = useAdd();
  const def = TYPE_MAP.restaurant;
  const [seen, setSeen] = useState<Seen>('alle');
  const [trait, setTrait] = useState('');
  const [picking, setPicking] = useState(false);
  const [pasting, setPasting] = useState(false);
  const toast = useToast();
  const [view, setViewState] = useState<'lijst' | 'kaart'>(() => {
    try { return localStorage.getItem('bijdehand:restaurantView') === 'kaart' ? 'kaart' : 'lijst'; } catch { return 'lijst'; }
  });
  const setView = (v: 'lijst' | 'kaart') => {
    setViewState(v);
    try { localStorage.setItem('bijdehand:restaurantView', v); } catch { /* alleen gemak */ }
  };
  const [geo, setGeo] = useState<{ busy: boolean; done: number; total: number; failed: boolean }>({ busy: false, done: 0, total: 0, failed: false });
  const [showMissing, setShowMissing] = useState(false);
  const all = liveItems.filter((i) => i.type === 'restaurant');
  // Kaart open: ontbrekende locaties opzoeken (één keer per adres; zie geocode.ts).
  const missingIds = all.filter(needsGeocode).map((i) => i.id).join(',');
  // Eén ronde tegelijk; tijdens de ronde veranderen de items (gevonden punten), dat mag de ronde niet afbreken.
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  useEffect(() => {
    if (view !== 'kaart' || !missingIds || running.current || geo.failed) return;
    running.current = true;
    const ids = missingIds.split(',');
    setGeo({ busy: true, done: 0, total: ids.length, failed: false });
    const done = (failed: boolean) => {
      running.current = false;
      if (mounted.current) setGeo((g) => ({ ...g, busy: false, failed }));
    };
    void geocodeMissing(ids, (n, total) => { if (mounted.current) setGeo((g) => ({ ...g, done: n, total })); })
      .then((r) => done(r.failed))
      .catch(() => done(true));
  }, [view, missingIds, geo.failed]);
  const traitCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of all) for (const t of traitsOf(i)) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'nl'));
  }, [all]);
  const byTrait = all.filter((i) => !trait || traitsOf(i).includes(trait));
  const byTraitBeen = byTrait.filter(hasBeen).length;
  const beenCount = all.filter(hasBeen).length;
  const shown = byTrait.filter((i) => seen === 'alle' || (seen === 'geweest') === hasBeen(i));
  const groups = groupByCity(shown);
  const newOne = () => add({ type: 'restaurant', openAfter: true, mode: 'text' });

  return (
    <div className="screen">
      <BrandHeader
        art="restaurant"
        back="/verzamelingen"
        title={def.plural}
        sub={all.length ? `${all.length} plekken · ${beenCount} geweest` : 'Waar wil je nog eten?'}
        actions={
          <>
            <button type="button" className="icon-btn" aria-label="Zoeken in Restaurants" onClick={() => navigate('/zoeken?type=restaurant')}><Search size={22} /></button>
            {all.length > 0 && (
              <button type="button" className="icon-btn" aria-label={view === 'kaart' ? 'Lijst tonen' : 'Kaart tonen'} onClick={() => setView(view === 'kaart' ? 'lijst' : 'kaart')}>
                {view === 'kaart' ? <List size={22} /> : <MapIcon size={22} />}
              </button>
            )}
          </>
        }
      />
      <BrandPanel sticky={all.length > 0}>
      {all.length > 0 && (
        <div className="r-filters">
          <div className="r-filter-row">
            <Segmented<Seen>
              label="Filter op geweest"
              value={seen}
              onChange={setSeen}
              options={[
                { value: 'alle', label: <>Alle <span className="seg-count" aria-hidden="true">{byTrait.length}</span></> },
                { value: 'niet', label: <><span aria-label="Nog niet geweest">Nog niet</span> <span className="seg-count" aria-hidden="true">{byTrait.length - byTraitBeen}</span></> },
                { value: 'geweest', label: <>Geweest <span className="seg-count" aria-hidden="true">{byTraitBeen}</span></> },
              ]}
            />
            {traitCounts.length > 0 && (
              <button type="button" className="icon-btn filter-btn" aria-label={trait ? 'Filter (actief)' : 'Filter op label'} aria-haspopup="dialog" onClick={() => setPicking(true)}>
                <ListFilter size={22} />{trait && <span className="badge-dot" aria-hidden="true" />}
              </button>
            )}
          </div>
          {trait && (
            <div className="r-active">
              {trait && <button type="button" className="chip on" aria-label={`Filter ${trait} weghalen`} onClick={() => setTrait('')}>{trait} <X size={16} /></button>}
            </div>
          )}
        </div>
      )}
      </BrandPanel>
      {all.length === 0 ? (
        <Empty
          icon={<TypeIcon type="restaurant" size={28} />}
          title="Nog geen restaurants"
          text="Heb je al een lijstje, bijvoorbeeld in Keep? Plak het in één keer."
          action={
            <div className="stack">
              <button type="button" className="btn btn-primary" onClick={newOne}><Plus size={18} /> Restaurant toevoegen</button>
              <button type="button" className="btn" onClick={() => setPasting(true)}><ClipboardPaste size={18} /> Lijst plakken</button>
            </div>
          }
        />
      ) : shown.length === 0 ? (
        <Empty title="Niets gevonden met deze filters" />
      ) : view === 'kaart' ? (
        <>
          <RestaurantMap items={shown} onOpen={(id) => navigate(`/item/${id}`)} onLocateError={(m) => toast(m, { tone: 'error' })} />
          <MapLegend />
          {geo.busy && <p className="hint" role="status">Locaties opzoeken… {geo.done ? `${geo.done} van ${geo.total}` : ''}</p>}
          {!geo.busy && geo.failed && <p className="notice notice-error" role="alert">Locaties opzoeken lukte niet (geen verbinding?). Het wordt opnieuw geprobeerd als je de kaart weer opent.</p>}
          {(() => {
            const missing = shown.filter((i) => !hasLocation(i));
            if (!missing.length) return null;
            return (
              <div className="empty-types">
                <button type="button" className="btn btn-ghost r-edit-toggle" aria-expanded={showMissing} onClick={() => setShowMissing(!showMissing)}>
                  <span className="empty-types-label">{missing.length} zonder locatie</span>
                  <ChevronDown size={18} className={showMissing ? 'rot' : ''} />
                </button>
                {showMissing && (
                  <>
                    <p className="hint">Zonder (vindbaar) adres. Vul het adres in via het restaurant → Gegevens bewerken; daarna zoekt de kaart opnieuw.</p>
                    <div className="r-block">{missing.map((i) => <RestaurantRow key={i.id} item={i} />)}</div>
                  </>
                )}
              </div>
            );
          })()}
        </>
      ) : (
        groups.map((g) => (
          <Section key={g.title} className="city" title={<>{g.title} <span className="group-count">· {g.items.length}</span></>}>
            <div className="r-block">{g.items.map((i) => <RestaurantRow key={i.id} item={i} />)}</div>
          </Section>
        ))
      )}
      {all.length > 0 && (
        <button type="button" className="btn btn-ghost" onClick={() => setPasting(true)}><ClipboardPaste size={18} /> Lijst plakken</button>
      )}
      <Sheet open={picking} onClose={() => setPicking(false)} title="Filter">
        <ChipGroup
          label="Labels"
          value={trait}
          onChange={(v) => { setTrait(v); setPicking(false); }}
          options={[{ value: '', label: 'Alle labels' }, ...traitCounts.map(([t, n]) => ({ value: t, label: t, count: n }))]}
        />
      </Sheet>
      <PasteSheet type="restaurant" open={pasting} onClose={() => setPasting(false)} />
    </div>
  );
}
