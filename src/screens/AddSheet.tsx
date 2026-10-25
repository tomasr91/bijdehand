import { ChevronDown, Lightbulb, Link2, ListChecks, Plus, Type, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { suggestType } from '../data/classify';
import { typeDef } from '../data/itemTypes';
import type { Source, TypeKey } from '../data/model';
import { addSource, capture, findSourceByUrl } from '../data/repo';
import { splitLines } from '../data/paste';
import { findUrl, fold, formatDate, dayOf, isUrl, siteOf } from '../data/util';
import { Segmented, Sheet, TypeIcon, AutoText } from '../components/ui';
import { TypePicker } from '../components/editors';
import { useData, useToast, type AddOptions } from '../ui/context';
import { navigate } from '../ui/router';

type Mode = 'text' | 'link' | 'checklist';

export function AddSheet({ open, opts, onClose }: { open: boolean; opts: AddOptions; onClose: () => void }) {
  const toast = useToast();
  const { liveItems, links } = useData();
  const [mode, setMode] = useState<Mode>('text');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<string[]>([]);
  const [lineDraft, setLineDraft] = useState('');
  const [type, setType] = useState<TypeKey | null>(null);
  const [picking, setPicking] = useState(false);
  const [existing, setExisting] = useState<Source | undefined>();
  const [busy, setBusy] = useState(false);
  const firstInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setMode(opts.mode ?? (opts.url ? 'link' : opts.type === 'packing' ? 'checklist' : 'text'));
    setText(opts.text ?? '');
    setUrl(opts.url ?? '');
    setTitle(opts.urlTitle ?? '');
    setNote('');
    setLines([]);
    setLineDraft('');
    setType(opts.type ?? null);
    setExisting(undefined);
    setBusy(false);
  }, [open, opts]);

  // Focus pas na openen, en alleen als de gebruiker zelf nog geen veld heeft gekozen
  // (anders zou snel typen in het verkeerde veld belanden).
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      const active = document.activeElement;
      const userChoseField = active instanceof HTMLElement && active.closest('.sheet') && /^(INPUT|TEXTAREA)$/.test(active.tagName);
      if (!userChoseField) firstInput.current?.focus();
    }, 60);
    return () => window.clearTimeout(t);
  }, [open, mode]);

  const cleanUrl = mode === 'link' ? findUrl(url) : null;

  // Een hele lijst plakken (meerdere regels): elke regel wordt een punt, ook als je in het naamveld plakt.
  const pasteLines = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (!/\r?\n/.test(text.trim())) return;
    e.preventDefault();
    setLines((cur) => [...cur, ...splitLines(text)]);
  };

  useEffect(() => {
    let alive = true;
    if (cleanUrl) void findSourceByUrl(cleanUrl).then((s) => alive && setExisting(s && !s.deletedAt ? s : undefined));
    else setExisting(undefined);
    return () => { alive = false; };
  }, [cleanUrl]);

  const firstLine = (mode === 'text' ? text.split('\n')[0] : title).trim();
  const suggestion = useMemo(() => {
    if (type) return null;
    const hay = [text, title, note, ...lines].join(' ');
    return suggestType(hay, cleanUrl, lines.length);
  }, [type, text, title, note, lines, cleanUrl]);

  const duplicate = useMemo(() => {
    if (!firstLine || firstLine.length < 3) return undefined;
    const f = fold(firstLine);
    return liveItems.find((i) => fold(i.title) === f && (!type || i.type === type));
  }, [firstLine, liveItems, type]);

  const onTextChange = (v: string) => {
    // Een geplakte link wordt herkend en naar de link-modus gezet.
    if (mode === 'text' && !text && isUrl(v)) {
      setMode('link');
      setUrl(v.trim());
      return;
    }
    setText(v);
  };

  const allLines = () => [...lines, ...lineDraft.split('\n')].map((l) => l.trim()).filter(Boolean);
  const canSave =
    !busy && (mode === 'text' ? text.trim().length > 0 : mode === 'link' ? !!cleanUrl : title.trim().length > 0 || allLines().length > 0);

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      const via = opts.viaShare ? 'deelmenu' : 'handmatig';
      if (mode === 'link' && !type && existing) {
        // Link stond er al: geen dubbel item. Staat hij bij een item, verwijs daarnaar.
        const linked = links.filter((l) => !l.deletedAt && (l.aId === existing.id || l.bId === existing.id)).map((l) => (l.aId === existing.id ? l.bId : l.aId));
        const item = liveItems.find((i) => linked.includes(i.id));
        if (item) {
          if (note.trim()) await addSource({ url: cleanUrl!, title, note, infoVia: via });
          onClose();
          toast(`Deze link heb je al bewaard bij "${item.title}"`, { action: { label: 'Openen', run: () => navigate(`/item/${item.id}`) } });
          return;
        }
      }
      const body = mode === 'text' ? text.split('\n').slice(1).join('\n').trim() : '';
      const r = await capture({
        type,
        title: mode === 'text' ? firstLine : title,
        body,
        url: mode === 'link' ? cleanUrl! : undefined,
        urlTitle: mode === 'link' ? title : undefined,
        sourceNote: mode === 'link' ? note : undefined,
        checklist: mode === 'checklist' ? allLines() : undefined,
        suggestion,
        infoVia: via,
      });
      onClose();
      const where = type ? typeDef(type)!.plural : 'Inbox';
      if (opts.openAfter) navigate(`/item/${r.item.id}`);
      toast(`Bewaard in ${where}`, opts.openAfter ? undefined : { action: { label: 'Openen', run: () => navigate(`/item/${r.item.id}`) } });
    } catch (e) {
      console.error(e);
      toast('Opslaan is mislukt. Je invoer staat er nog.', { tone: 'error' });
      setBusy(false);
    }
  };

  const tdef = typeDef(type);

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={tdef ? `Nieuw: ${tdef.label.toLowerCase()}` : 'Iets bewaren'}
        footer={
          <button type="button" className="btn btn-primary btn-block" disabled={!canSave} onClick={() => void save()}>
            Bewaren
          </button>
        }
      >
        <div onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save(); }}>
          <Segmented<Mode>
            label="Soort invoer"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'text', label: (<><Type size={16} /> Tekst</>) },
              { value: 'link', label: (<><Link2 size={16} /> Link</>) },
              { value: 'checklist', label: (<><ListChecks size={16} /> Checklist</>) },
            ]}
          />

          {mode === 'text' && (
            <AutoText
              className="capture-text"
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              placeholder={tdef ? tdef.titlePlaceholder : 'Wat wil je onthouden? Eerste regel wordt de titel.'}
              aria-label="Tekst"
              minRows={3}
              autoFocus
            />
          )}

          {mode === 'link' && (
            <div className="stack">
              <input ref={firstInput} type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Plak een link" aria-label="Link" enterKeyHint="next" autoCapitalize="none" />
              {cleanUrl && <p className="hint">{siteOf(cleanUrl)}</p>}
              {existing && (
                <p className="notice">Deze link heb je al bewaard op {formatDate(dayOf(existing.createdAt))}. Hij wordt niet dubbel opgeslagen.</p>
              )}
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tdef ? tdef.titlePlaceholder : 'Titel (optioneel)'} aria-label="Titel" enterKeyHint="next" />
              <AutoText value={note} onChange={(e) => setNote(e.target.value)} placeholder="Waarom is dit interessant? (optioneel)" aria-label="Eigen notitie" minRows={2} />
              {!type && <p className="hint">Zonder soort komt de link alleen in Bronnen.</p>}
            </div>
          )}

          {mode === 'checklist' && (
            <div className="stack">
              <input ref={firstInput} type="text" value={title} onChange={(e) => setTitle(e.target.value)} onPaste={pasteLines} placeholder={tdef ? tdef.titlePlaceholder : 'Naam van de lijst'} aria-label="Naam van de lijst" enterKeyHint="next" />
              <ul className="capture-lines">
                {lines.map((l, i) => (
                  <li key={i}>
                    <span className="check" aria-hidden="true" />
                    <span>{l}</span>
                    <button type="button" className="icon-btn subtle" aria-label={`${l} verwijderen`} onClick={() => setLines(lines.filter((_, j) => j !== i))}><X size={18} /></button>
                  </li>
                ))}
              </ul>
              <form className="entry-add" onSubmit={(e) => { e.preventDefault(); const t = lineDraft.trim(); if (t) { setLines([...lines, t]); setLineDraft(''); } }}>
                <Plus size={20} aria-hidden="true" />
                <input value={lineDraft} onChange={(e) => setLineDraft(e.target.value)} onPaste={pasteLines} placeholder="Punt toevoegen of hele lijst plakken" aria-label="Punt toevoegen" enterKeyHint="enter" />
              </form>
            </div>
          )}

          {duplicate && (
            <p className="notice">
              Je hebt al “{duplicate.title}”.{' '}
              <button type="button" className="link-btn" onClick={() => { onClose(); navigate(`/item/${duplicate.id}`); }}>Bekijken</button>
            </p>
          )}

          <div className="capture-type">
            <button type="button" className="type-select" onClick={() => setPicking(true)} aria-label={`Soort: ${tdef?.label ?? 'Inbox'}. Wijzigen`}>
              <TypeIcon type={type} size={18} />
              <span>{tdef ? tdef.label : 'Inbox · later indelen'}</span>
              <ChevronDown size={18} />
            </button>
            {suggestion && (
              <button type="button" className="suggest" onClick={() => setType(suggestion.type)}>
                <Lightbulb size={16} /> {typeDef(suggestion.type)!.label}?
              </button>
            )}
          </div>
        </div>
      </Sheet>
      <TypePicker open={picking} value={type} onClose={() => setPicking(false)} onPick={(t) => { setType(t); setPicking(false); }} />
    </>
  );
}
