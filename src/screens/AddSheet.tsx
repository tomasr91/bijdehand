import { ChevronDown, Lightbulb } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { suggestType } from '../data/classify';
import { typeDef } from '../data/itemTypes';
import type { Source, TypeKey } from '../data/model';
import { addSource, capture, findSourceByUrl } from '../data/repo';
import { findUrl, fold, formatDate, dayOf, siteOf } from '../data/util';
import { Sheet, TypeIcon, AutoText } from '../components/ui';
import { TypePicker } from '../components/editors';
import { useData, useToast, type AddOptions } from '../ui/context';
import { navigate } from '../ui/router';

type Mode = 'text' | 'link';

export function AddSheet({ open, opts, onClose }: { open: boolean; opts: AddOptions; onClose: () => void }) {
  const toast = useToast();
  const { liveItems, links } = useData();
  const [mode, setMode] = useState<Mode>('text');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [hint, setHint] = useState('');
  const [type, setType] = useState<TypeKey | null>(null);
  const [picking, setPicking] = useState(false);
  const [existing, setExisting] = useState<Source | undefined>();
  const [busy, setBusy] = useState(false);
  const firstInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setMode(opts.url ? 'link' : 'text'); // alleen tekst bij ➕; link alleen via het deelmenu
    setText(opts.text ?? '');
    setUrl(opts.url ?? '');
    setTitle(opts.urlTitle ?? '');
    setNote('');
    setHint('');
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

  useEffect(() => {
    let alive = true;
    if (cleanUrl) void findSourceByUrl(cleanUrl).then((s) => alive && setExisting(s && !s.deletedAt ? s : undefined));
    else setExisting(undefined);
    return () => { alive = false; };
  }, [cleanUrl]);

  const firstLine = (mode === 'text' ? text.split('\n')[0] : title).trim();
  const suggestion = useMemo(() => {
    if (type) return null;
    const hay = [text, title, note].join(' ');
    return suggestType(hay, cleanUrl, 0);
  }, [type, text, title, note, cleanUrl]);

  const duplicate = useMemo(() => {
    if (!firstLine || firstLine.length < 3) return undefined;
    const f = fold(firstLine);
    return liveItems.find((i) => fold(i.title) === f && (!type || i.type === type));
  }, [firstLine, liveItems, type]);

  const onTextChange = (v: string) => {
    // Een geplakte link wordt herkend en naar de link-modus gezet.
    setText(v);
  };

  const canSave =
    !busy && (mode === 'text' ? text.trim().length > 0 : !!cleanUrl);

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
      // De gekozen soort is een wens voor de Claude-taak, geen directe indeling (D29): alles gaat naar de Inbox.
      // Je tekst blijft heel (geen titel uit de eerste regel); Claude maakt de naam.
      const r = await capture({
        type: null,
        title: mode === 'text' ? '' : title,
        body: mode === 'text' ? text.trim() : '',
        url: mode === 'link' ? cleanUrl! : findUrl(text) ?? undefined,
        urlTitle: mode === 'link' ? title : undefined,
        sourceNote: mode === 'link' ? note : undefined,
        
        suggestion: type ? { type, reason: 'jouw keuze', by: 'eigenaar' } : suggestion,
        hint,
        infoVia: via,
      });
      onClose();
      toast(type ? `In de Inbox · Claude zet het bij ${typeDef(type)!.plural}` : 'Bewaard in Inbox', { action: { label: 'Openen', run: () => navigate(`/item/${r.item.id}`) } });
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
        title="Iets bewaren"
        footer={
          <button type="button" className="btn btn-primary btn-block" disabled={!canSave} onClick={() => void save()}>
            Bewaren
          </button>
        }
      >
        <div onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save(); }}>
          {mode === 'text' && (
            <AutoText
              className="capture-text"
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              placeholder="Wat wil je onthouden?"
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
            </div>
          )}

          {duplicate && (
            <p className="notice">
              Je hebt al “{duplicate.title}”.{' '}
              <button type="button" className="link-btn" onClick={() => { onClose(); navigate(`/item/${duplicate.id}`); }}>Bekijken</button>
            </p>
          )}

          <div className="field capture-hint">
            <label htmlFor="add-hint">Tip voor Claude (optioneel)</label>
            <AutoText id="add-hint" value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Bijv. naam vergeten, staat bij de brug in Maarssen" minRows={1} />
          </div>

          <div className="capture-type">
            <button type="button" className="type-select" onClick={() => setPicking(true)} aria-label={`Soort voor Claude: ${tdef?.label ?? 'Claude kiest'}. Wijzigen`}>
              <TypeIcon type={type} size={18} />
              <span>{tdef ? `Claude zet het bij: ${tdef.label}` : 'Inbox · Claude kiest de soort'}</span>
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
