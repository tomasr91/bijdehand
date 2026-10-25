// Minimale hash-router met echte browsergeschiedenis, zodat de Android-terugknop werkt.
import { useEffect, useState } from 'react';

export interface Route {
  path: string[];
  query: URLSearchParams;
}

const EVT = 'bijdehand:route';

/** Startpagina van de app. */
export const HOME = '/verzamelingen';

/** Huidig pad inclusief query, bijv. "/zoeken?q=gent". */
export function currentPath(): string {
  return '/' + location.hash.replace(/^#\/?/, '');
}

function parse(): Route {
  const raw = currentPath().replace(/^\//, '');
  const [p, q = ''] = raw.split('?');
  return { path: p.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q) };
}

function idx(): number {
  return typeof history.state?.idx === 'number' ? history.state.idx : 0;
}

export function initRouter(): void {
  if (!location.hash) history.replaceState({ idx: 0 }, '', `${location.pathname}${location.search}#${HOME}`);
  else if (typeof history.state?.idx !== 'number') history.replaceState({ idx: 0 }, '', location.href);
}

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  const url = `${location.pathname}${location.search}#${to.startsWith('/') ? to : '/' + to}`;
  // Staat er nog een open sheet in de geschiedenis, vervang die dan (anders zou sluiten "terug" doen).
  if (opts.replace || history.state?.sheet) history.replaceState({ idx: idx() }, '', url);
  else history.pushState({ idx: idx() + 1 }, '', url);
  window.dispatchEvent(new Event(EVT));
}

export function goBack(fallback: string): void {
  if (idx() > 0) history.back();
  else navigate(fallback, { replace: true });
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const update = () => setRoute(parse());
    window.addEventListener('popstate', update);
    window.addEventListener('hashchange', update);
    window.addEventListener(EVT, update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener('hashchange', update);
      window.removeEventListener(EVT, update);
    };
  }, []);
  return route;
}

let sheetCounter = 0;

/** Laat een open sheet/dialoog meedoen met de terugknop: terug = sluiten. */
export function useBackToClose(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;
    const id = ++sheetCounter;
    history.pushState({ ...history.state, sheet: id }, '', location.href);
    const onPop = () => {
      if (history.state?.sheet !== id) onClose();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (history.state?.sheet === id) history.back();
    };
    // onClose mag wisselen per render; alleen open/dicht telt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

/** Wacht tot open sheets uit de geschiedenis zijn (hun "terug" is verwerkt), max. 500 ms. */
export function afterSheetsClosed(): Promise<void> {
  return new Promise((resolve) => {
    if (!history.state?.sheet) return resolve();
    const done = () => {
      window.removeEventListener('popstate', check);
      window.clearTimeout(t);
      resolve();
    };
    const check = () => !history.state?.sheet && done();
    window.addEventListener('popstate', check);
    const t = window.setTimeout(done, 500);
  });
}
