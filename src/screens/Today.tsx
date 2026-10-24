import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, Inbox, Plus, Settings, ShieldAlert } from 'lucide-react';
import { useMemo } from 'react';
import { ItemCard, SourceCard } from '../components/cards';
import { Empty, IS_PREVIEW, PreviewNotice, Section } from '../components/ui';
import { isDone } from '../data/itemTypes';
import type { Item, Source } from '../data/model';
import { getMeta, META_LAST_EXPORT } from '../data/repo';
import { loadSampleData } from '../data/sample';
import { daysBetween, localDate } from '../data/util';
import { useAdd, useData, useToast } from '../ui/context';
import { navigate } from '../ui/router';

const DAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

function greeting(h: number) {
  return h < 6 ? 'Goedenacht' : h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond';
}

/** Datum waarop een item aandacht vraagt, of null. */
export function attentionDate(i: Item): string | null {
  if (isDone(i)) return null;
  if (i.type === 'todo' && typeof i.fields.due === 'string' && i.fields.due) return i.fields.due;
  if (i.type === 'plant' && typeof i.fields.nextCare === 'string' && i.fields.nextCare) return i.fields.nextCare;
  if (i.type === 'packing' && i.fields.isTemplate !== true && typeof i.fields.tripDate === 'string' && i.fields.tripDate && i.checklist.some((e) => !e.done)) return i.fields.tripDate;
  return null;
}

export function Today() {
  const { liveItems, liveSources } = useData();
  const add = useAdd();
  const toast = useToast();
  const lastExport = useLiveQuery(() => getMeta(META_LAST_EXPORT), [], 'loading');
  const today = localDate();
  const now = new Date();

  const { attention, soon, inbox, recent } = useMemo(() => {
    const attention: Item[] = [];
    const soon: Item[] = [];
    for (const i of liveItems) {
      const d = attentionDate(i);
      const diff = d ? daysBetween(today, d) : null;
      if (diff !== null && diff <= 0) attention.push(i);
      else if (i.type === 'todo' && !isDone(i) && i.fields.priority === 'hoog') attention.push(i);
      else if (diff !== null && diff <= (i.type === 'packing' ? 14 : 7)) soon.push(i);
    }
    const byDate = (a: Item, b: Item) => (attentionDate(a) ?? '9999').localeCompare(attentionDate(b) ?? '9999');
    const recent: ({ kind: 'item'; v: Item } | { kind: 'source'; v: Source })[] = [
      ...liveItems.map((v) => ({ kind: 'item' as const, v })),
      ...liveSources.map((v) => ({ kind: 'source' as const, v })),
    ].sort((a, b) => b.v.createdAt.localeCompare(a.v.createdAt)).slice(0, 5);
    return { attention: attention.sort(byDate), soon: soon.sort(byDate), inbox: liveItems.filter((i) => i.type === null).length, recent };
  }, [liveItems, liveSources, today]);

  const total = liveItems.length + liveSources.length;
  const needsBackup = !IS_PREVIEW && lastExport !== 'loading' && total > 0 && (!lastExport || daysBetween(lastExport.slice(0, 10), today) > 14);

  return (
    <div className="screen">
      <header className="today-head">
        <div>
          <p className="eyebrow">{DAYS[now.getDay()]} {now.getDate()} {MONTHS[now.getMonth()]}</p>
          <h1>{greeting(now.getHours())}</h1>
        </div>
        <button type="button" className="icon-btn" aria-label="Instellingen en back-up" onClick={() => navigate('/instellingen')}>
          <Settings size={22} />
        </button>
      </header>

      <PreviewNotice />

      <button type="button" className="capture-cta" onClick={() => add()}>
        <Plus size={22} /> <span>Iets bewaren…</span>
      </button>

      {total === 0 && (
        <Empty
          title="Nog niets bewaard"
          text="Bewaar een idee, link of lijstje. Indelen kan later. Wil je eerst rondkijken? Laad dan een kleine set voorbeeldgegevens; die kun je later in één keer verwijderen."
          action={
            <button type="button" className="btn" onClick={async () => { const n = await loadSampleData(); toast(`${n} voorbeelditems geladen`); }}>
              Voorbeeldgegevens laden
            </button>
          }
        />
      )}

      {needsBackup && (
        <button type="button" className="banner banner-warn" onClick={() => navigate('/instellingen')}>
          <ShieldAlert size={20} />
          <span>{lastExport ? 'Je laatste back-up is meer dan 14 dagen oud.' : 'Je hebt nog geen back-up gemaakt.'} Gegevens staan alleen op dit apparaat.</span>
          <ChevronRight size={18} />
        </button>
      )}

      {inbox > 0 && (
        <button type="button" className="banner" onClick={() => navigate('/inbox')}>
          <Inbox size={20} />
          <span><b>{inbox} in de Inbox</b> om in te delen</span>
          <ChevronRight size={18} />
        </button>
      )}

      {attention.length > 0 && (
        <Section title="Aandacht nodig">
          <div className="list">{attention.map((i) => <ItemCard key={i.id} item={i} />)}</div>
        </Section>
      )}

      {soon.length > 0 && (
        <Section title="Binnenkort">
          <div className="list">{soon.map((i) => <ItemCard key={i.id} item={i} />)}</div>
        </Section>
      )}

      {(attention.length > 0 || soon.length > 0) && (
        <p className="footnote">Herinneringen staan alleen hier in de app. Meldingen op je telefoon zijn er nog niet.</p>
      )}

      {recent.length > 0 && (
        <Section title="Recent bewaard">
          <div className="list">
            {recent.map((r) => (r.kind === 'item' ? <ItemCard key={r.v.id} item={r.v} quick={false} /> : <SourceCard key={r.v.id} source={r.v} />))}
          </div>
        </Section>
      )}
    </div>
  );
}
