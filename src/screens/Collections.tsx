import { ChevronRight, CircleAlert, ClipboardPaste, Cloud, CloudOff, Settings, Inbox as InboxIcon, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { fold } from '../data/util';
import { PasteSheet } from './PasteSheet';
import { PlaceCollection } from './Places';
import { ItemCard } from '../components/cards';
import { BrandHeader, BrandPanel, Empty, Section, Segmented, TypeIcon } from '../components/ui';
import { useLiveQuery } from 'dexie-react-hooks';
import { getSyncStatus } from '../data/sync';
import { formatDateTime } from '../data/util';
import { isDone, TYPE_MAP, TYPES } from '../data/itemTypes';
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
      <BrandHeader
        art="home"
        title="Bijdehand"
        sub="Alles wat je wilt onthouden."
        actions={<button type="button" className="icon-btn" aria-label="Instellingen" onClick={() => navigate('/instellingen')}><Settings size={22} /></button>}
      />
      <BrandPanel />
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

const MONTH_NAMES = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

/** Congressen: per maand, het eerstvolgende bovenaan; zonder datum achteraan. */
function groupByMonth(list: Item[]): { title: string; items: Item[] }[] {
  const start = (i: Item) => (typeof i.fields.startDate === 'string' ? i.fields.startDate : '');
  const upcoming = list.filter((i) => !isDone(i));
  const past = list.filter(isDone);
  const sorted = [...upcoming].sort((a, b) => Number(!start(a)) - Number(!start(b)) || start(a).localeCompare(start(b)) || a.title.localeCompare(b.title, 'nl'));
  const m = new Map<string, { title: string; items: Item[] }>();
  for (const i of sorted) {
    const d = start(i);
    const key = d ? d.slice(0, 7) : '';
    const title = d ? `${MONTH_NAMES[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : 'Datum onbekend';
    const g = m.get(key) ?? { title, items: [] };
    g.items.push(i);
    m.set(key, g);
  }
  const groups = [...m.values()];
  if (past.length) groups.push({ title: 'Geweest', items: [...past].sort((a, b) => start(b).localeCompare(start(a))) });
  return groups;
}

function groupItems(type: TypeKey, list: Item[]): { title: string; items: Item[] }[] {
  const def = TYPE_MAP[type];
  if (type === 'conference') return groupByMonth(list);
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

function sortItems(list: Item[]): Item[] {
  return [...list].sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || b.updatedAt.localeCompare(a.updatedAt));
}

export function Collection({ type }: { type: TypeKey }) {
  if (TYPE_MAP[type].place) return <PlaceCollection type={type} />;
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
      <BrandHeader art="packing" back="/verzamelingen" title="Paklijst" />
      <BrandPanel />
      <Empty icon={<TypeIcon type="packing" size={28} />} title="Nog geen paklijst" text="Eén vakantiepaklijst: afvinken tijdens het inpakken en daarna alles weer uitvinken." action={<button type="button" className="btn btn-primary" onClick={() => void create()}><Plus size={18} /> Paklijst maken</button>} />
    </div>
  );
}

type Done = 'alle' | 'open' | 'klaar';

/** Verzameling zonder eigen scherm (nu: albums). Merkkop, plakkend filter met aantallen, losse kaarten. */
function GenericCollection({ type }: { type: TypeKey }) {
  const { liveItems } = useData();
  const add = useAdd();
  const def = TYPE_MAP[type];
  const [done, setDone] = useState<Done>('alle');
  const [pasting, setPasting] = useState(false);
  const all = liveItems.filter((i) => i.type === type);
  const doneCount = all.filter(isDone).length;
  const [openLabel, doneLabel] = def.filterLabels ?? ['Nog open', 'Klaar'];
  const shown = all.filter((i) => done === 'alle' || (done === 'klaar') === isDone(i));
  const groups = groupItems(type, sortItems(shown));
  const art = type === 'album' ? 'album' : type === 'conference' ? 'conference' : 'home';

  return (
    <div className="screen">
      <BrandHeader
        art={art}
        back="/verzamelingen"
        title={def.plural}
        sub={all.length ? `${all.length} ${all.length === 1 ? def.label.toLowerCase() : def.plural.toLowerCase()} · ${doneCount} ${doneLabel.toLowerCase()}` : undefined}
        actions={<button type="button" className="icon-btn" aria-label={`Zoeken in ${def.plural}`} onClick={() => navigate(`/zoeken?type=${type}`)}><Search size={22} /></button>}
      />
      <BrandPanel sticky={all.length > 0 && !!def.doneStatuses}>
        {all.length > 0 && def.doneStatuses && (
          <Segmented<Done>
            label="Filter op status"
            value={done}
            onChange={setDone}
            options={[
              { value: 'alle', label: <>Alle <span className="seg-count" aria-hidden="true">{all.length}</span></> },
              { value: 'open', label: <>{openLabel} <span className="seg-count" aria-hidden="true">{all.length - doneCount}</span></> },
              { value: 'klaar', label: <>{doneLabel} <span className="seg-count" aria-hidden="true">{doneCount}</span></> },
            ]}
          />
        )}
      </BrandPanel>
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
        <Empty title="Niets gevonden met dit filter" />
      ) : (
        groups.map((g) => (
          <Section key={g.title || 'all'} className="city" title={g.title ? (<>{g.title} <span className="group-count">· {g.items.length}</span></>) : undefined}>
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
      <BrandHeader art="inbox" back="/verzamelingen" title="Inbox" sub={list.length ? `${list.length} nog in te delen` : 'Claude deelt elke ochtend in'} />
      <BrandPanel />
      {list.length === 0 ? (
        <Empty icon={<InboxIcon size={28} />} title="De Inbox is leeg" text="Wat je zonder soort bewaart, komt hier. Claude deelt het elke ochtend in, of je doet het zelf." action={<button type="button" className="btn" onClick={() => add()}>Iets bewaren</button>} />
      ) : (
        <div className="list">{list.map((i) => <ItemCard key={i.id} item={i} />)}</div>
      )}
    </div>
  );
}
