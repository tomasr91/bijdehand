import { ExternalLink, Info, Library, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SourceCard } from '../components/cards';
import { HistorySection, LinksSection, SaveStatus } from '../components/editors';
import { AutoText, Empty, Section, TopBar } from '../components/ui';
import type { Source } from '../data/model';
import * as repo from '../data/repo';
import { search } from '../data/search';
import { formatDateTime } from '../data/util';
import { useAdd, useData, useToast } from '../ui/context';
import { useDraft } from '../ui/draft';
import { goBack } from '../ui/router';

export function Sources() {
  const data = useData();
  const add = useAdd();
  const [q, setQ] = useState('');
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of data.links) {
      if (l.deletedAt) continue;
      for (const id of [l.aId, l.bId]) m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [data.links]);
  const list = useMemo(() => {
    if (q.trim()) return search(data, q, { kind: 'sources' }).hits.flatMap((h) => (h.kind === 'source' ? [h.source] : []));
    return [...data.liveSources].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [data, q]);

  return (
    <div className="screen">
      <TopBar title="Bronnen" actions={<button type="button" className="icon-btn accent" aria-label="Link bewaren" onClick={() => add({ mode: 'link' })}><Plus size={24} /></button>} />
      {data.liveSources.length > 0 && (
        <div className="search-box">
          <Search size={18} aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek in bronnen" aria-label="Zoek in bronnen" enterKeyHint="search" />
        </div>
      )}
      {data.liveSources.length === 0 ? (
        <Empty icon={<Library size={28} />} title="Nog geen bronnen" text="Websites, artikelen, producten en video's die je bewaart, komen hier. Je kunt ze koppelen aan items." action={<button type="button" className="btn btn-primary" onClick={() => add({ mode: 'link' })}><Plus size={18} /> Link bewaren</button>} />
      ) : list.length === 0 ? (
        <Empty title="Geen bronnen gevonden" />
      ) : (
        <div className="list">{list.map((s) => <SourceCard key={s.id} source={s} linkedCount={counts.get(s.id)} />)}</div>
      )}
    </div>
  );
}

const VIA: Record<Source['infoVia'], string> = {
  handmatig: 'zelf ingevuld',
  deelmenu: 'titel uit het deelmenu',
  import: 'uit een import',
  voorbeeld: 'voorbeeldgegevens',
  opgezocht: 'opgezocht door Claude',
};

function SourceEditor({ source }: { source: Source }) {
  const toast = useToast();
  const save = (k: keyof repo.SourcePatch) => (v: string) => repo.updateSource(source.id, { [k]: v });
  const [url, setUrl, fUrl] = useDraft(source.url, save('url'));
  const [title, setTitle, fTitle] = useDraft(source.title, save('title'));
  const [desc, setDesc, fDesc] = useDraft(source.description, save('description'));
  const [img, setImg, fImg] = useDraft(source.imageUrl, save('imageUrl'));
  const [note, setNote, fNote] = useDraft(source.note, save('note'));
  const [imgOk, setImgOk] = useState(true);

  const remove = async () => {
    await repo.deleteSource(source.id);
    goBack('/bronnen');
    toast('Bron naar prullenbak verplaatst', { action: { label: 'Ongedaan maken', run: () => void repo.restoreSource(source.id) } });
  };

  return (
    <div className="screen detail">
      <TopBar back="/bronnen" title="Bron" actions={<SaveStatus />} />

      <a className="btn btn-primary btn-block" href={source.url} target="_blank" rel="noopener noreferrer">
        <ExternalLink size={18} /> Open {source.site || 'link'}
      </a>

      <Section title="Broninformatie" className="panel panel-external">
        <p className="panel-label"><Info size={14} /> Van de website · {VIA[source.infoVia]}</p>
        <div className="field"><label htmlFor="s-url">Link</label><input id="s-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} onBlur={fUrl} autoCapitalize="none" /></div>
        <div className="field"><label htmlFor="s-title">Titel</label><input id="s-title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={fTitle} placeholder="Titel van de pagina" /></div>
        <div className="field"><label htmlFor="s-desc">Korte beschrijving</label><AutoText id="s-desc" value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={fDesc} minRows={2} /></div>
        <div className="field">
          <label htmlFor="s-img">Afbeelding (link)</label>
          <input id="s-img" type="url" inputMode="url" value={img} onChange={(e) => { setImg(e.target.value); setImgOk(true); }} onBlur={fImg} placeholder="https://…/afbeelding.jpg" autoCapitalize="none" />
          {source.imageUrl && imgOk && <img className="source-img" src={source.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImgOk(false)} />}
        </div>
        <p className="hint">Titel, beschrijving en afbeelding worden nog niet automatisch opgehaald; vul ze zelf in als je wilt.</p>
      </Section>

      <Section title="Mijn notitie" className="panel panel-own">
        <AutoText value={note} onChange={(e) => setNote(e.target.value)} onBlur={fNote} placeholder="Waarom is dit interessant?" aria-label="Mijn notitie" minRows={3} />
      </Section>

      <Section title="Gekoppeld aan"><LinksSection kind="source" id={source.id} /></Section>

      <HistorySection current={source} />
      <p className="meta">Bewaard {formatDateTime(source.createdAt)} · gewijzigd {formatDateTime(source.updatedAt)}</p>
      <button type="button" className="btn btn-ghost danger" onClick={() => void remove()}><Trash2 size={18} /> Naar prullenbak</button>
    </div>
  );
}

export function SourceDetail({ id }: { id: string }) {
  const { sourceById } = useData();
  const s = sourceById.get(id);
  if (!s) return <div className="screen"><TopBar back="/bronnen" title="Niet gevonden" /><Empty title="Deze bron bestaat niet (meer)." /></div>;
  if (s.deletedAt) {
    return (
      <div className="screen">
        <TopBar back="/prullenbak" title={s.title || s.site} />
        <Empty title="Deze bron staat in de prullenbak." action={<button type="button" className="btn btn-primary" onClick={() => void repo.restoreSource(id)}>Terugzetten</button>} />
      </div>
    );
  }
  return <SourceEditor key={s.id} source={s} />;
}
