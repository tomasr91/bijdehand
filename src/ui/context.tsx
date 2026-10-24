import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { db } from '../data/db';
import type { Item, Link, Source, TypeKey } from '../data/model';

// ---------- Gegevens ----------

export interface Data {
  items: Item[];
  sources: Source[];
  links: Link[];
  liveItems: Item[];
  liveSources: Source[];
  itemById: Map<string, Item>;
  sourceById: Map<string, Source>;
}

const DataCtx = createContext<Data | null>(null);

export function DataProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const items = useLiveQuery(() => db.items.toArray(), []);
  const sources = useLiveQuery(() => db.sources.toArray(), []);
  const links = useLiveQuery(() => db.links.toArray(), []);
  const value = useMemo<Data | null>(() => {
    if (!items || !sources || !links) return null;
    return {
      items,
      sources,
      links,
      liveItems: items.filter((i) => !i.deletedAt),
      liveSources: sources.filter((s) => !s.deletedAt),
      itemById: new Map(items.map((i) => [i.id, i])),
      sourceById: new Map(sources.map((s) => [s.id, s])),
    };
  }, [items, sources, links]);
  if (!value) return <>{fallback}</>;
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useData(): Data {
  const d = useContext(DataCtx);
  if (!d) throw new Error('useData buiten DataProvider');
  return d;
}

/** Live koppelingen van een record, opgesplitst naar items en bronnen. */
export function useLinked(id: string): { items: { link: Link; item: Item }[]; sources: { link: Link; source: Source }[] } {
  const { links, itemById, sourceById } = useData();
  return useMemo(() => {
    const items: { link: Link; item: Item }[] = [];
    const sources: { link: Link; source: Source }[] = [];
    for (const l of links) {
      if (l.deletedAt || (l.aId !== id && l.bId !== id)) continue;
      const other = l.aId === id ? l.bId : l.aId;
      const it = itemById.get(other);
      if (it && !it.deletedAt) items.push({ link: l, item: it });
      const s = sourceById.get(other);
      if (s && !s.deletedAt) sources.push({ link: l, source: s });
    }
    return { items, sources };
  }, [links, itemById, sourceById, id]);
}

// ---------- Meldingen (toast) ----------

interface ToastMsg {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
  tone?: 'ok' | 'error';
}

const ToastCtx = createContext<(text: string, opts?: Omit<ToastMsg, 'id' | 'text'>) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((text: string, opts: Omit<ToastMsg, 'id' | 'text'> = {}) => {
    window.clearTimeout(timer.current);
    setMsg({ id: Date.now(), text, ...opts });
    timer.current = window.setTimeout(() => setMsg(null), opts.action ? 6000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toast-region" aria-live="polite" role="status">
        {msg && (
          <div key={msg.id} className={`toast ${msg.tone === 'error' ? 'toast-error' : ''}`}>
            <span>{msg.text}</span>
            {msg.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  msg.action!.run();
                  setMsg(null);
                }}
              >
                {msg.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

// ---------- Toevoegen ----------

export interface AddOptions {
  type?: TypeKey | null;
  mode?: 'text' | 'link' | 'checklist';
  text?: string;
  url?: string;
  urlTitle?: string;
  viaShare?: boolean;
  /** Na opslaan meteen het nieuwe item openen. */
  openAfter?: boolean;
}

export const AddCtx = createContext<(opts?: AddOptions) => void>(() => {});

export function useAdd() {
  return useContext(AddCtx);
}
