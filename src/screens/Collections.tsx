import { ChevronRight, CircleAlert, ClipboardPaste, Cloud, CloudOff, Settings, Inbox as InboxIcon, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { fold } from '../data/util';
import { PasteSheet } from './PasteSheet';
import { RestaurantCollection } from './Restaurants';
import { ItemCard } from '../components/cards';
import { ChipGroup, Empty, Section, TopBar, TypeIcon } from '../components/ui';
import { useLiveQuery } from 'dexie-react-hooks';
import { getSyncStatus } from '../data/sync';
import { formatDateTime } from '../data/util';
import { isDone, statusOf, TYPE_MAP, TYPES } from '../data/itemTypes';
import type { Item, TypeKey } from '../data/model';
import { useAdd, useData } from '../ui/context';
import { navigate } from '../ui/router';
import * as repo from '../data/repo';
import { thePackingList } from '../data/repo';

/** Hoofdscherm: alleen soorten waar iets in zit (grootste eerst); lege soorten niet (kiezen kan bij Toevoegen). Inbox alleen als er iets in staat. */
export function Collections() {
  const { liveItems, items, sources } = useData();
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of liveItems) m.set(i.type ?? 'inbox', (m.get(i.type ?? 'inbox') ?? 0) + 1);
    return m;
  }, [liveItems]);
  const inbox = counts.get('inbox') ?? 0;
  const packing = thePackingList(liveItems);
  const trash = items.filter((i) => i.deletedAt).length + sources.filter((s) => s.deletedAt).length;
  const used = TYPES.filter((t) => counts.get(t.key)).sort((a, b) => (counts.get(b.key) ?? 0) - (counts.get(a.key) ?? 0) || a.plural.localeCompare(b.plural, 'nl'));

  return (
    <div className="screen">
      <TopBar
        title="Bijdehand"
        actions={<button type="button" className="icon-btn" aria-label="Instellingen" onClick={() => navigate('/instellingen')}><Settings size={22} /></button>}
      />
      {inbox > 0 && (
        <button type="button" className="banner banner-inbox" onClick={() => navigate('/inbox')}>
          <InboxIcon size={20} />
          <span><b>Inbox</b> · {inbox} nog in te delen</span>
          <ChevronRight size={18} />
        </button>
      )}
      {used.length === 0 && inbox === 0 ? (
        <Empty title="Nog niets bewaard" text="Tik op + om iets te bewaren: een restaurant, een boek, een cadeau-idee. Je hoeft geen soort te kiezen." />
      ) : (
        <div className="tiles">
          {used.map((t) => (
            <button key={t.key} type="button" className="tile" onClick={() => navigate(t.key === 'packing' && packing ? `/item/${packing.id}` : `/verzameling/${t.key}`)}>
              <TypeIcon type={t.key} size={22} />
              <span className="tile-label">{t.key === 'packing' ? t.label : t.plural}</span>
              <span className="tile-count">{counts.get(t.key)}</span>
            </button>
          ))}
        </div>
      )}
      <SyncLine />
      {trash > 0 && (
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/prullenbak')}>
          <Trash2 size={18} /> Prullenbak ({trash})
        </button>
      )}
    </div>
  );
}

/** Eén regel onderaan het hoofdscherm: is alles veilig opgeslagen? */
function SyncLine() {
  const st = useLiveQuery(getSyncStatus, []);
  if (!st) return null;
  if (!st.connected) {
    return (
      <button type="button" className="home-status warn" onClick={() => navigate('/instellingen')}>
        <CloudOff size={16} /> Alleen op dit toestel bewaard · GitHub koppelen <ChevronRight size={16} />
      </button>
    );
  }
  if (st.error) {
    return (
      <button type="button" className="home-status bad" onClick={() => navigate('/instellingen')}>
        <CircleAlert size={16} /> Synchroniseren mislukt · bekijk Instellingen <ChevronRight size={16} />
      </button>
    );
  }
  return (
    <p className="home-status">
      <Cloud size={16} /> {st.lastAt ? `Bijgewerkt ${formatDateTime(st.lastAt)}` : 'Gekoppeld'} · Claude deelt elke ochtend in
    </p>
  );
}

function groupItems(type: TypeKey, list: Item[]): { title: string; items: Item[] }[] {
  const def = TYPE_MAP[type];
  if (def.groupBy) {
    // Hoofdletterongevoelig groeperen ("utrecht" en "Utrecht" samen); de eerste schrijfwijze is de kop.
    const rest = 'Overig';
    const m = new Map<string, { title: string; items: Item[] }>();
    for (const i of list) {
      const label = String(i.fields[def.groupBy] ?? '').trim();
      const key = label ? fold(label) : '\uffff';
      const g = m.get(key) ?? { title: label || rest, items: [] };
      g.items.push(i);
      m.set(key, g);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, 'nl')).map(([, g]) => g);
  }
  return [{ title: '', items: list }];
}

function sortItems(type: TypeKey, list: Item[]): Item[] {
  const prio: Record<string, number> = { hoog: 0, normaal: 1, laag: 2 };
  const s = [...list];
  if (type === 'todo') {
    return s.sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || (prio[String(a.fields.priority)] ?? 1) - (prio[String(b.fields.priority)] ?? 1) || String(a.fields.due || '9').localeCompare(String(b.fields.due || '9')));
  }
  if (type === 'plant') return s.sort((a, b) => String(a.fields.nextCare || '9').localeCompare(String(b.fields.nextCare || '9')));
  if (type === 'size') return s.sort((a, b) => String(a.fields.garment ?? '').localeCompare(String(b.fields.garment ?? ''), 'nl'));
  return s.sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || b.updatedAt.localeCompare(a.updatedAt));
}

export function Collection({ type }: { type: TypeKey }) {
  if (type === 'restaurant') return <RestaurantCollection />;
  if (type === 'packing') return <PackingStart />;
  return <GenericCollection type={type} />;
}

/** Er is één paklijst (D23): meteen openen; is er nog geen, dan er één maken. */
function PackingStart() {
  const { liveItems } = useData();
  const packing = thePackingList(liveItems);
  useEffect(() => {
    if (packing) navigate(`/item/${packing.id}`, { replace: true });
  }, [packing?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (packing) return null;
  const create = async () => {
    const item = await repo.createItem({ type: 'packing', title: 'Vakantie' });
    navigate(`/item/${item.id}`, { replace: true });
  };
  return (
    <div className="screen">
      <TopBar back="/verzamelingen" title="Paklijst" />
      <Empty icon={<TypeIcon type="packing" size={28} />} title="Nog geen paklijst" text="Eén vakantiepaklijst: afvinken tijdens het inpakken en daarna alles weer uitvinken." action={<button type="button" className="btn btn-primary" onClick={() => void create()}><Plus size={18} /> Paklijst maken</button>} />
    </div>
  );
}

function GenericCollection({ type }: { type: TypeKey }) {
  const { liveItems } = useData();
  const add = useAdd();
  const def = TYPE_MAP[type];
  const [status, setStatus] = useState('');
  const [trait, setTrait] = useState('');
  const [pasting, setPasting] = useState(false);
  const [allTraits, setAllTraits] = useState(false);
  const all = liveItems.filter((i) => i.type === type);
  const statusField = def.statusKey ? def.fields.find((f) => f.key === def.statusKey) : undefined;
  const traitsOf = (i: Item): string[] => (def.filterKey && Array.isArray(i.fields[def.filterKey]) ? (i.fields[def.filterKey] as string[]) : []);
  const traitCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of all) for (const t of traitsOf(i)) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'nl'));
  }, [all]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = all.filter((i) => (!status || statusOf(i) === status) && (!trait || traitsOf(i).includes(trait)));
  const groups = groupItems(type, sortItems(type, shown));

  return (
    <div className="screen">
      <TopBar
        back="/verzamelingen"
        title={def.plural}
        actions={
          <>
            <button type="button" className="icon-btn" aria-label={`Zoeken in ${def.plural}`} onClick={() => navigate(`/zoeken?type=${type}`)}><Search size={22} /></button>
          </>
        }
      />
      {statusField?.options && all.length > 0 && (
        <ChipGroup
          label="Filter op status"
          value={status}
          onChange={setStatus}
          options={[
            { value: '', label: 'Alle', count: all.length },
            // Statussen zonder items weglaten (rustiger op een telefoon), behalve als ze gekozen zijn.
            ...statusField.options
              .map((o) => ({ value: o.value, label: o.label, count: all.filter((i) => statusOf(i) === o.value).length }))
              .filter((o) => o.count > 0 || o.value === status),
          ]}
        />
      )}
      {traitCounts.length > 0 && (
        <ChipGroup
          label="Filter op kenmerk"
          value={trait}
          onChange={setTrait}
          options={[
            { value: '', label: 'Elk kenmerk' },
            ...traitCounts.filter(([t], i) => allTraits || i < 4 || t === trait).map(([t, n]) => ({ value: t, label: t, count: n })),
          ]}
          extra={traitCounts.length > 4 && (
            <button type="button" className="chip chip-add" aria-expanded={allTraits} onClick={() => setAllTraits(!allTraits)}>
              {allTraits ? 'Minder' : `+${traitCounts.length - 4} meer`}
            </button>
          )}
        />
      )}
      {all.length === 0 ? (
        <Empty
          icon={<TypeIcon type={type} size={28} />}
          title={`Nog geen ${def.plural.toLowerCase()}`}
          text="Heb je al een lijstje, bijvoorbeeld in Keep? Plak het in één keer."
          action={
            <div className="stack">
              <button type="button" className="btn btn-primary" onClick={() => add({ type, openAfter: true, mode: def.checklist ? 'checklist' : 'text' })}><Plus size={18} /> {def.label} toevoegen</button>
              <button type="button" className="btn" onClick={() => setPasting(true)}><ClipboardPaste size={18} /> Lijst plakken</button>
            </div>
          }
        />
      ) : shown.length === 0 ? (
        <Empty title="Niets gevonden met deze filters" />
      ) : (
        groups.map((g) => (
          <Section key={g.title || 'all'} title={g.title ? (<>{g.title} <span className="group-count">· {g.items.length}</span></>) : undefined} className={type === 'size' ? 'size-group' : ''}>
            <div className="list">{g.items.map((i) => <ItemCard key={i.id} item={i} showType={false} />)}</div>
          </Section>
        ))
      )}
      {all.length > 0 && (
        <button type="button" className="btn btn-ghost" onClick={() => setPasting(true)}><ClipboardPaste size={18} /> Lijst plakken</button>
      )}
      <PasteSheet type={type} open={pasting} onClose={() => setPasting(false)} />
    </div>
  );
}

export function InboxScreen() {
  const { liveItems } = useData();
  const add = useAdd();
  const list = liveItems.filter((i) => i.type === null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="screen">
      <TopBar back="/verzamelingen" title="Inbox" sub="Alles wat nog geen soort heeft · Claude deelt elke ochtend in" />
      {list.length === 0 ? (
        <Empty icon={<InboxIcon size={28} />} title="De Inbox is leeg" text="Wat je zonder soort bewaart, komt hier. Claude deelt het elke ochtend in, of je doet het zelf." action={<button type="button" className="btn" onClick={() => add()}>Iets bewaren</button>} />
      ) : (
        <div className="list">{list.map((i) => <ItemCard key={i.id} item={i} />)}</div>
      )}
    </div>
  );
}
