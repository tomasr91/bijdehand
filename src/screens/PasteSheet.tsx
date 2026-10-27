import { useEffect, useMemo, useState } from 'react';
import { AutoText, Sheet } from '../components/ui';
import { TYPE_MAP } from '../data/itemTypes';
import type { TypeKey } from '../data/model';
import { parseLines } from '../data/paste';
import { createPasted, undoPasted } from '../data/repo';
import { fold } from '../data/util';
import { useData, useToast } from '../ui/context';

const key = (title: string, city: unknown) => `${fold(title)}|${typeof city === 'string' ? fold(city) : ''}`;

/** Een lijstje (één regel per item) in één keer toevoegen aan een verzameling. */
export function PasteSheet({ type, open, onClose }: { type: TypeKey; open: boolean; onClose: () => void }) {
  const { liveItems } = useData();
  const toast = useToast();
  const def = TYPE_MAP[type];
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setText('');
      setBusy(false);
    }
  }, [open]);

  const rows = useMemo(() => {
    const existing = new Set(liveItems.filter((i) => i.type === type).map((i) => key(i.title, i.fields.city)));
    const seen = new Set<string>();
    return parseLines(type, text).map((r) => {
      const k = key(r.title, r.fields.city);
      const dup = existing.has(k) || seen.has(k);
      seen.add(k);
      return { ...r, dup };
    });
  }, [text, liveItems, type]);
  const toAdd = rows.filter((r) => !r.dup && r.title);

  const save = async () => {
    if (!toAdd.length) return;
    setBusy(true);
    try {
      const ids = await createPasted(type, toAdd);
      onClose();
      toast(`${ids.length} ${type === 'clothing' ? (ids.length === 1 ? 'merk' : 'merken') : ids.length === 1 ? def.label.toLowerCase() : def.plural.toLowerCase()} toegevoegd`, {
        action: { label: 'Ongedaan maken', run: async () => { const n = await undoPasted(ids); toast(`${n} weer verwijderd`); } },
      });
    } catch (e) {
      console.error(e);
      toast('Toevoegen is mislukt; er is niets opgeslagen.', { tone: 'error' });
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Lijst plakken in ${def.plural}`}
      footer={
        <button type="button" className="btn btn-primary btn-block" disabled={!toAdd.length || busy} onClick={() => void save()}>
          {toAdd.length ? `${toAdd.length} toevoegen` : 'Toevoegen'}
        </button>
      }
    >
      <AutoText
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={def.placeTexts?.pasteExample ?? (type === 'clothing' ? 'Eén merk per regel, bijv.\nLes Deux trui S\nCast Iron polo M, blouse S/M' : 'Eén per regel')}
        aria-label="Geplakte lijst"
        minRows={4}
      />
      {def.place && (
        <p className="hint">Vorm: <i>Plaats - Naam (kenmerken)</i>.{type === 'restaurant' ? ' Een keuken zoals "Afghaans" wordt herkend;' : ''} Wat tussen haakjes staat worden kenmerken. Je oorspronkelijke regel wordt bewaard.</p>
      )}
      {rows.length > 0 && (
        <ul className="paste-preview" aria-label="Voorbeeld">
          {rows.map((r, i) => (
            <li key={i} className={r.dup ? 'dup' : ''}>
              <b>{r.title || '—'}</b>
              {(r.fields.city || r.fields.cuisine) && <small>{[r.fields.city, r.fields.cuisine].filter(Boolean).join(' · ')}</small>}
              {Array.isArray(r.fields.sizes) && r.fields.sizes.length > 0 && <small>{(r.fields.sizes as string[]).join(' · ')}</small>}
              {Array.isArray(r.fields.traits) && r.fields.traits.length > 0 && (
                <span className="mini-tags">{r.fields.traits.map((t) => <span key={t}>{t}</span>)}</span>
              )}
              {r.note && <small>Notitie: {r.note}</small>}
              {r.dup && <small>Staat er al — wordt overgeslagen</small>}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
