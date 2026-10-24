// Lokale invoer met automatisch opslaan (na korte pauze, bij verlaten van het veld en bij sluiten).
import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveState = 'idle' | 'pending' | 'saved' | 'error';

const EVT = 'bijdehand:save';

export function emitSave(state: SaveState): void {
  window.dispatchEvent(new CustomEvent<SaveState>(EVT, { detail: state }));
}

/** Voert een opslagactie uit en meldt de status aan de opslagindicator. */
export async function tracked<T>(p: Promise<T>): Promise<T | undefined> {
  try {
    const r = await p;
    emitSave('saved');
    return r;
  } catch (e) {
    console.error(e);
    emitSave('error');
    return undefined;
  }
}

export function useSaveState(): SaveState {
  const [s, setS] = useState<SaveState>('idle');
  useEffect(() => {
    let t: number | undefined;
    const on = (e: Event) => {
      const v = (e as CustomEvent<SaveState>).detail;
      setS(v);
      window.clearTimeout(t);
      if (v === 'saved') t = window.setTimeout(() => setS('idle'), 1800);
    };
    window.addEventListener(EVT, on);
    return () => {
      window.removeEventListener(EVT, on);
      window.clearTimeout(t);
    };
  }, []);
  return s;
}

export function useDraft<T>(external: T, save: (v: T) => Promise<unknown>, delay = 500): [T, (v: T) => void, () => void] {
  const [value, setValue] = useState(external);
  const dirty = useRef(false);
  const latest = useRef(external);
  const timer = useRef<number | undefined>(undefined);
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    if (!dirty.current) {
      setValue(external);
      latest.current = external;
    }
  }, [external]);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    void tracked(saveRef.current(latest.current));
  }, []);

  const change = useCallback(
    (v: T) => {
      setValue(v);
      latest.current = v;
      dirty.current = true;
      emitSave('pending');
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, delay);
    },
    [delay, flush],
  );

  useEffect(() => {
    // App naar de achtergrond (Android) of tab dicht: direct opslaan, niet wachten op de timer.
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);
  return [value, change, flush];
}
