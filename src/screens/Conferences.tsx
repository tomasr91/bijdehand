// Congressen: een kale lijst op datum. Tik op een regel opent de link; het potlood opent een klein venster om te wijzigen.
// Geen detailscherm en weinig velden (naam, datum, plaats, link); andere velden blijven verborgen bewaard.
import { ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BrandHeader, BrandPanel, Empty, Sheet, TypeIcon } from '../components/ui';
import type { Item } from '../data/model';
import * as repo from '../data/repo';
import { formatDate, localDate } from '../data/util';
import { useData, useToast } from '../ui/context';


const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const safeUrl = (v: unknown) => (/^https?:\/\//i.test(str(v)) ? str(v) : '');

/** Eerstvolgende bovenaan; zonder datum daarna; voorbije congressen onderaan (laatste eerst). */
export function sortConferences(list: Item[], today = localDate()): Item[] {
  const d = (i: Item) => str(i.fields.startDate);
  const rank = (i: Item) => (!d(i) ? 1 : d(i) < today ? 2 : 0);
  return [...list].sort((a, b) =>
    rank(a) - rank(b)
    || (rank(a) === 2 ? d(b).localeCompare(d(a)) : d(a).localeCompare(d(b)))
    || a.title.localeCompare(b.title, 'nl'));
}

function ConferenceSheet({ item, open, onClose }: { item: Item | null; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [city, setCity] = useState('');
  const [site, setSite] = useState('');
  useEffect(() => {
    if (!open) return;
    setTitle(item?.title ?? '');
    setDate(str(item?.fields.startDate));
    setCity(str(item?.fields.city));
    setSite(str(item?.fields.website));
  }, [open, item]);

  const save = async () => {
    const fields = { startDate: date || null, city: city.trim() || null, website: site.trim() || null };
    if (item) await repo.updateItem(item.id, (cur) => ({ title: title.trim(), fields: { ...cur.fields, ...fields } }));
    else await repo.createItem({ type: 'conference', title: title.trim(), fields });
    onClose();
  };
  const remove = async () => {
    if (!item) return;
    await repo.deleteItem(item.id);
    onClose();
    toast('Naar prullenbak verplaatst', { action: { label: 'Ongedaan maken', run: () => void repo.restoreItem(item.id) } });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={item ? 'Congres wijzigen' : 'Congres toevoegen'}
      footer={<button type="button" className="btn btn-primary btn-block" disabled={!title.trim()} onClick={() => void save()}>Bewaren</button>}
    >
      <div className="fields">
        <div className="field"><label htmlFor="cf-title">Naam</label><input id="cf-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Naam van het congres" enterKeyHint="next" /></div>
        <div className="field"><label htmlFor="cf-date">Datum</label><input id="cf-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="field"><label htmlFor="cf-city">Plaats</label><input id="cf-city" type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Bijv. Utrecht, of Online" enterKeyHint="next" /></div>
        <div className="field"><label htmlFor="cf-site">Link</label><input id="cf-site" type="url" value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://…" enterKeyHint="done" /></div>
      </div>
      {item && <button type="button" className="btn btn-ghost btn-danger-text" onClick={() => void remove()}><Trash2 size={18} /> Congres verwijderen</button>}
    </Sheet>
  );
}

export function ConferenceCollection() {
  const { liveItems } = useData();
  const all = sortConferences(liveItems.filter((i) => i.type === 'conference'));
  const [editing, setEditing] = useState<{ item: Item | null } | null>(null);
  const today = localDate();
  const upcoming = all.filter((i) => !str(i.fields.startDate) || str(i.fields.startDate) >= today).length;

  return (
    <div className="screen">
      <BrandHeader
        art="conference"
        back="/verzamelingen"
        title="Congressen"
        sub={all.length ? `${upcoming} aankomend` : 'Waar wil je naartoe?'}
        actions={<button type="button" className="icon-btn" aria-label="Congres toevoegen" onClick={() => setEditing({ item: null })}><Plus size={22} /></button>}
      />
      <BrandPanel />
      {all.length === 0 ? (
        <Empty
          icon={<TypeIcon type="conference" size={28} />}
          title="Nog geen congressen"
          text="Zet een congres in de Inbox, dan zoekt Claude de datum en link erbij. Of voeg er zelf een toe."
          action={<button type="button" className="btn btn-primary" onClick={() => setEditing({ item: null })}><Plus size={18} /> Congres toevoegen</button>}
        />
      ) : (
        <div className="r-block">
          {all.map((i) => {
            const url = safeUrl(i.fields.website);
            const when = str(i.fields.startDate) ? formatDate(str(i.fields.startDate)) : '';
            const sub = [when, str(i.fields.city)].filter(Boolean).join(' · ');
            const past = !!str(i.fields.startDate) && str(i.fields.startDate) < today;
            const text = (
              <span className="r-row-text">
                <span className="r-row-title">{i.title || 'Zonder titel'}</span>
                {sub && <span className="r-row-sub">{sub}</span>}
              </span>
            );
            return (
              <div key={i.id} className="r-row conf-row" style={past ? { opacity: 0.6 } : undefined}>
                {url ? (
                  <a className="conf-main" href={url} target="_blank" rel="noopener noreferrer" aria-label={`${i.title}, website openen`}>{text}<ExternalLink size={16} aria-hidden="true" /></a>
                ) : (
                  <button type="button" className="conf-main" onClick={() => setEditing({ item: i })} aria-label={`${i.title} wijzigen`}>{text}</button>
                )}
                <button type="button" className="icon-btn" aria-label={`${i.title} wijzigen`} onClick={() => setEditing({ item: i })}><Pencil size={18} /></button>
              </div>
            );
          })}
        </div>
      )}
      <ConferenceSheet item={editing?.item ?? null} open={editing !== null} onClose={() => setEditing(null)} />
    </div>
  );
}

