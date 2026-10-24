import { ExternalLink, Info, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { HistorySection, LinksSection, SaveStatus } from '../components/editors';
import { AutoText, Empty, Section, TopBar } from '../components/ui';
import type { Source } from '../data/model';
import * as repo from '../data/repo';
import { formatDateTime } from '../data/util';
import { useData, useToast } from '../ui/context';
import { useDraft } from '../ui/draft';
import { goBack } from '../ui/router';

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
    goBack('/verzamelingen');
    toast('Bron naar prullenbak verplaatst', { action: { label: 'Ongedaan maken', run: () => void repo.restoreSource(source.id) } });
  };

  return (
    <div className="screen detail">
      <TopBar back="/verzamelingen" title="Bron" actions={<SaveStatus />} />

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
  if (!s) return <div className="screen"><TopBar back="/verzamelingen" title="Niet gevonden" /><Empty title="Deze bron bestaat niet (meer)." /></div>;
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
