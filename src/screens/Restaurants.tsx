// Restaurantlijst: één filterrij (geweest of niet), labels via de filterknop, per plaats een blok met rijen.
// Belangrijkste eerst: favorieten, dan je cijfer (hoog → laag), dan waar je nog niet was.
import { ClipboardPaste, ListFilter, Plus, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { RestaurantRow } from '../components/cards';
import { ChipGroup, Empty, Section, Segmented, Sheet, TopBar, TypeIcon } from '../components/ui';
import { hasBeen, TYPE_MAP } from '../data/itemTypes';
import type { Item } from '../data/model';
import { fold } from '../data/util';
import { useAdd, useData } from '../ui/context';
import { navigate } from '../ui/router';
import { PasteSheet } from './PasteSheet';

type Seen = 'alle' | 'niet' | 'geweest';

const traitsOf = (i: Item): string[] => (Array.isArray(i.fields.traits) ? i.fields.traits : []);

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
  const all = liveItems.filter((i) => i.type === 'restaurant');
  const traitCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of all) for (const t of traitsOf(i)) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'nl'));
  }, [all]);
  const shown = all.filter((i) => (seen === 'alle' || (seen === 'geweest') === hasBeen(i)) && (!trait || traitsOf(i).includes(trait)));
  const groups = groupByCity(shown);
  const newOne = () => add({ type: 'restaurant', openAfter: true, mode: 'text' });

  return (
    <div className="screen">
      <TopBar
        back="/verzamelingen"
        title={def.plural}
        actions={
          <>
            <button type="button" className="icon-btn" aria-label="Zoeken in Restaurants" onClick={() => navigate('/zoeken?type=restaurant')}><Search size={22} /></button>
            {traitCounts.length > 0 && (
              <button type="button" className="icon-btn" aria-label={trait ? `Filter op label: ${trait}` : 'Filter op label'} aria-haspopup="dialog" onClick={() => setPicking(true)}>
                <ListFilter size={22} />{trait && <span className="badge-dot" aria-hidden="true" />}
              </button>
            )}
            <button type="button" className="icon-btn accent" aria-label="Nieuw: Restaurant" onClick={newOne}><Plus size={24} /></button>
          </>
        }
      />
      {all.length > 0 && (
        <div className="r-filters">
          <Segmented<Seen>
            label="Filter op geweest"
            value={seen}
            onChange={setSeen}
            options={[
              { value: 'alle', label: 'Alle' },
              { value: 'niet', label: <span aria-label="Nog niet geweest">Nog niet</span> },
              { value: 'geweest', label: 'Geweest' },
            ]}
          />
          {trait && (
            <div className="r-active">
              <button type="button" className="chip on" aria-label={`Filter ${trait} weghalen`} onClick={() => setTrait('')}>{trait} <X size={16} /></button>
            </div>
          )}
        </div>
      )}
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
      ) : (
        groups.map((g) => (
          <Section key={g.title} title={<>{g.title} <span className="group-count">· {g.items.length}</span></>}>
            <div className="r-block">{g.items.map((i) => <RestaurantRow key={i.id} item={i} />)}</div>
          </Section>
        ))
      )}
      {all.length > 0 && (
        <button type="button" className="btn btn-ghost" onClick={() => setPasting(true)}><ClipboardPaste size={18} /> Lijst plakken</button>
      )}
      <Sheet open={picking} onClose={() => setPicking(false)} title="Filter op label">
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
