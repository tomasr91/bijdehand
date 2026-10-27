// Kleding (D28): per merk welke stukken en maten je hebt. Kaal: geen detailscherm; tik op een merk = klein venster om te wijzigen.
// Twee weergaven: per merk, of per stuk ("welke maat trui heb ik?"). Zoeken filtert op merk en stuk.
import { ClipboardPaste, Plus, Search as SearchIcon, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AutoText, BrandHeader, BrandPanel, Empty, Segmented, Sheet, TypeIcon } from '../components/ui';
import type { Item } from '../data/model';
import { sizeParts, splitLines } from '../data/paste';
import * as repo from '../data/repo';
import { fold } from '../data/util';
import { useData, useToast } from '../ui/context';
import { PasteSheet } from './PasteSheet';

type View = 'merk' | 'stuk';

const sizesOf = (i: Item): string[] => (Array.isArray(i.fields.sizes) ? (i.fields.sizes as string[]).filter((x) => typeof x === 'string' && x.trim()) : []);

/** Per stuk (hoofdletterongevoelig), op alfabet; per stuk de merken met hun maat. */
export function byPiece(items: Item[]): { piece: string; rows: { brand: string; size: string; item: Item }[] }[] {
  const m = new Map<string, { piece: string; rows: { brand: string; size: string; item: Item }[] }>();
  for (const i of items) {
    for (const e of sizesOf(i)) {
      const { piece, size } = sizeParts(e);
      const k = fold(piece);
      const g = m.get(k) ?? { piece, rows: [] };
      g.rows.push({ brand: i.title, size, item: i });
      m.set(k, g);
    }
  }
  return [...m.values()]
    .sort((a, b) => a.piece.localeCompare(b.piece, 'nl'))
    .map((g) => ({ ...g, rows: g.rows.sort((a, b) => a.brand.localeCompare(b.brand, 'nl')) }));
}

function Sizes({ list }: { list: string[] }) {
  return (
    <span className="r-row-sub cl-sizes">
      {list.map((e, n) => {
        const { piece, size } = sizeParts(e);
        return <span key={n}>{n > 0 && ' · '}{piece}{size && <> <b>{size}</b></>}</span>;
      })}
    </span>
  );
}

function ClothingSheet({ item, open, onClose }: { item: Item | null; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [brand, setBrand] = useState('');
  const [lines, setLines] = useState('');
  useEffect(() => {
    if (!open) return;
    setBrand(item?.title ?? '');
    setLines(item ? sizesOf(item).join('\n') : '');
  }, [open, item]);

  const save = async () => {
    const sizes = splitLines(lines).map((e) => {
      const { piece, size } = sizeParts(e);
      return `${piece.toLocaleLowerCase('nl')}${size ? ` ${size}` : ''}`;
    });
    if (item) await repo.updateItem(item.id, (cur) => ({ title: brand.trim(), fields: { ...cur.fields, sizes } }));
    else await repo.createItem({ type: 'clothing', title: brand.trim(), fields: { sizes } });
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
      title={item ? 'Merk wijzigen' : 'Merk toevoegen'}
      footer={<button type="button" className="btn btn-primary btn-block" disabled={!brand.trim()} onClick={() => void save()}>Bewaren</button>}
    >
      <div className="fields">
        <div className="field"><label htmlFor="cl-brand">Merk</label><input id="cl-brand" type="text" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Bijv. Les Deux" enterKeyHint="next" /></div>
        <div className="field">
          <label htmlFor="cl-sizes">Stukken en maten</label>
          <AutoText id="cl-sizes" value={lines} onChange={(e) => setLines(e.target.value)} placeholder={'Eén per regel, bijv.\ntrui M\nbroek 32/34'} minRows={3} />
        </div>
      </div>
      {item && <button type="button" className="btn btn-ghost btn-danger-text" onClick={() => void remove()}><Trash2 size={18} /> Merk verwijderen</button>}
    </Sheet>
  );
}

export function ClothingCollection() {
  const { liveItems } = useData();
  const [view, setView] = useState<View>('merk');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<{ item: Item | null } | null>(null);
  const [pasting, setPasting] = useState(false);
  const all = useMemo(() => liveItems.filter((i) => i.type === 'clothing').sort((a, b) => a.title.localeCompare(b.title, 'nl')), [liveItems]);
  const words = fold(q).split(/\s+/).filter(Boolean);
  const hit = (s: string) => words.every((w) => fold(s).includes(w));
  // Merk past → alle stukken; anders alleen de stukken die passen.
  const brands = all
    .map((i) => ({ item: i, sizes: !words.length || hit(i.title) ? sizesOf(i) : sizesOf(i).filter((e) => hit(`${i.title} ${e}`)) }))
    .filter((x) => !words.length || hit(x.item.title) || x.sizes.length);
  const pieces = byPiece(all)
    .map((g) => ({ ...g, rows: words.length && !hit(g.piece) ? g.rows.filter((r) => hit(`${r.brand} ${g.piece}`)) : g.rows }))
    .filter((g) => g.rows.length);

  return (
    <div className="screen">
      <BrandHeader
        art="clothing"
        back="/verzamelingen"
        title="Kleding"
        sub={all.length ? `${all.length} ${all.length === 1 ? 'merk' : 'merken'}` : 'Welke maat heb je bij welk merk?'}
        actions={<button type="button" className="icon-btn" aria-label="Merk toevoegen" onClick={() => setEditing({ item: null })}><Plus size={22} /></button>}
      />
      <BrandPanel sticky={all.length > 0}>
        {all.length > 0 && (
          <div className="stack">
            <form className="search-box" role="search" onSubmit={(e) => e.preventDefault()}>
              <SearchIcon size={20} aria-hidden="true" />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek merk of stuk, bijv. trui" aria-label="Zoeken in kleding" enterKeyHint="search" />
              {q && <button type="button" className="icon-btn subtle" aria-label="Wissen" onClick={() => setQ('')}><X size={18} /></button>}
            </form>
            <Segmented<View> label="Weergave" value={view} onChange={setView} options={[{ value: 'merk', label: 'Per merk' }, { value: 'stuk', label: 'Per stuk' }]} />
          </div>
        )}
      </BrandPanel>
      {all.length === 0 ? (
        <Empty
          icon={<TypeIcon type="clothing" size={28} />}
          title="Nog geen kleding"
          text="Plak je lijstje in één keer, één merk per regel, bijv. Les Deux trui S, broek 32."
          action={
            <div className="stack">
              <button type="button" className="btn btn-primary" onClick={() => setPasting(true)}><ClipboardPaste size={18} /> Lijst plakken</button>
              <button type="button" className="btn" onClick={() => setEditing({ item: null })}><Plus size={18} /> Merk toevoegen</button>
            </div>
          }
        />
      ) : (view === 'merk' ? brands.length : pieces.length) === 0 ? (
        <Empty title="Niets gevonden" />
      ) : view === 'merk' ? (
        <div className="r-block">
          {brands.map(({ item, sizes }) => (
            <button key={item.id} type="button" className="r-row" aria-label={`${item.title} wijzigen`} onClick={() => setEditing({ item })}>
              <span className="r-row-text">
                <span className="r-row-title">{item.title || 'Zonder merk'}</span>
                {sizes.length > 0 && <Sizes list={sizes} />}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="r-block">
          {pieces.map((g) => (
            <div key={g.piece} className="r-row cl-piece">
              <span className="r-row-text">
                <span className="r-row-title">{g.piece}</span>
                <span className="r-row-sub cl-sizes">
                  {g.rows.map((r, n) => (
                    <span key={n}>{n > 0 && ' · '}<button type="button" className="link-btn cl-brand" onClick={() => setEditing({ item: r.item })}>{r.brand}</button>{r.size && <> <b>{r.size}</b></>}</span>
                  ))}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
      {all.length > 0 && <button type="button" className="btn btn-ghost" onClick={() => setPasting(true)}><ClipboardPaste size={18} /> Lijst plakken</button>}
      <ClothingSheet item={editing?.item ?? null} open={editing !== null} onClose={() => setEditing(null)} />
      <PasteSheet type="clothing" open={pasting} onClose={() => setPasting(false)} />
    </div>
  );
}
