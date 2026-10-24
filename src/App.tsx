import { Component, useCallback, useEffect, useState, type ReactNode } from 'react';
import { LayoutGrid, Library, Plus, Search, Sun } from 'lucide-react';
import { isTypeKey } from './data/itemTypes';
import { findUrl } from './data/util';
import { db } from './data/db';
import { getMeta, setMeta } from './data/repo';
import { loadSampleData } from './data/sample';
import { applySeedBundles } from './data/seed';
import { IS_PREVIEW } from './components/ui';
import { AutoSync } from './ui/sync';
import { AddCtx, DataProvider, ToastProvider, type AddOptions } from './ui/context';
import { HOME, navigate, useRoute, type Route } from './ui/router';
import { AddSheet } from './screens/AddSheet';
import { Collection, Collections, InboxScreen } from './screens/Collections';
import { ItemDetail } from './screens/ItemDetail';
import { SearchScreen } from './screens/Search';
import { Settings, Trash } from './screens/Settings';
import { SourceDetail, Sources } from './screens/Sources';
import { Today } from './screens/Today';

const NAV = [
  { key: 'verzamelingen', label: 'Verzamelingen', icon: LayoutGrid },
  { key: 'vandaag', label: 'Vandaag', icon: Sun },
  { key: 'toevoegen', label: 'Toevoegen', icon: Plus },
  { key: 'bronnen', label: 'Bronnen', icon: Library },
  { key: 'zoeken', label: 'Zoeken', icon: Search },
] as const;

/** Welke hoofdbestemming hoort bij de huidige pagina. */
function section(route: Route): string {
  const p = route.path[0] ?? 'verzamelingen';
  if (p === 'verzameling' || p === 'inbox' || p === 'item') return 'verzamelingen';
  if (p === 'bron') return 'bronnen';
  if (p === 'instellingen' || p === 'prullenbak') return 'vandaag';
  return p;
}

function Screen({ route }: { route: Route }) {
  const [p, id] = route.path;
  switch (p) {
    case 'vandaag': return <Today />;
    case undefined:
    case 'verzamelingen': return <Collections />;
    case 'verzameling': return isTypeKey(id) ? <Collection key={id} type={id} /> : <Collections />;
    case 'inbox': return <InboxScreen />;
    case 'item': return <ItemDetail key={id} id={id} />;
    case 'bronnen': return <Sources />;
    case 'bron': return <SourceDetail key={id} id={id} />;
    case 'zoeken': return <SearchScreen route={route} />;
    case 'instellingen': return <Settings />;
    case 'prullenbak': return <Trash />;
    default: return <Collections />;
  }
}

/** Gedeelde inhoud via het Android-deelmenu komt binnen als ?title=&text=&url= (zie manifest). */
function readShare(): AddOptions | null {
  const p = new URLSearchParams(location.search);
  const title = p.get('title') ?? '';
  const text = p.get('text') ?? '';
  const url = p.get('url') || findUrl(text) || '';
  if (!title && !text && !url) return null;
  history.replaceState(history.state, '', `${location.pathname}${location.hash || `#${HOME}`}`);
  if (url) {
    const rest = text.replace(url, '').trim();
    return { mode: 'link', url, urlTitle: title || rest, viaShare: true };
  }
  return { mode: 'text', text: [title, text].filter(Boolean).join('\n'), viaShare: true };
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="screen fatal" role="alert">
        <h1>Er ging iets mis</h1>
        <p>De app kon niet bij de lokale opslag of liep vast. Je gegevens worden niet automatisch gewist.</p>
        <p className="hint">{this.state.error.message}</p>
        <p className="hint">Gebruik je een privévenster? Daarin is opslag vaak geblokkeerd.</p>
        <button type="button" className="btn btn-primary" onClick={() => location.reload()}>Opnieuw laden</button>
      </div>
    );
  }
}

export default function App() {
  const route = useRoute();
  const [add, setAdd] = useState<{ open: boolean; opts: AddOptions }>({ open: false, opts: {} });
  const current = section(route);
  const collectionType = route.path[0] === 'verzameling' && isTypeKey(route.path[1]) ? route.path[1] : null;

  const openAdd = useCallback((opts: AddOptions = {}) => setAdd({ open: true, opts }), []);
  const closeAdd = useCallback(() => setAdd((a) => ({ ...a, open: false })), []);

  // Proefversie: lijsten die Claude heeft klaargezet (ingebouwd bij het bouwen) eenmalig toepassen.
  // Zonder klaargezette lijsten: eenmalig voorbeeldgegevens, zodat er iets te zien is.
  useEffect(() => {
    if (!IS_PREVIEW) return;
    void (async () => {
      try {
        const bundles = window.__BIJDEHAND_SEED ?? [];
        if (bundles.length) {
          await applySeedBundles(bundles);
          return;
        }
        if ((await getMeta('previewSeeded')) || (await db.items.count()) > 0) return;
        await setMeta('previewSeeded', '1');
        await loadSampleData();
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  useEffect(() => {
    const shared = readShare();
    if (shared) openAdd(shared);
  }, [openAdd]);

  return (
    <ErrorBoundary>
      <ToastProvider>
        <DataProvider fallback={<div className="loading" aria-busy="true">Laden…</div>}>
          <AddCtx.Provider value={openAdd}>
            <div className="app">
              <main className="main">
                <Screen route={route} />
              </main>
              <AutoSync />
              <nav className="nav" aria-label="Hoofdnavigatie">
                {NAV.map(({ key, label, icon: Icon }) =>
                  key === 'toevoegen' ? (
                    <button key={key} type="button" className="nav-item nav-add" onClick={() => openAdd(collectionType ? { type: collectionType, openAfter: true } : {})}>
                      <span className="nav-add-circle"><Icon size={26} strokeWidth={2.4} /></span>
                      <span>{label}</span>
                    </button>
                  ) : (
                    <button key={key} type="button" className={`nav-item ${current === key ? 'on' : ''}`} aria-current={current === key ? 'page' : undefined} onClick={() => navigate(`/${key}`)}>
                      <Icon size={24} />
                      <span>{label}</span>
                    </button>
                  ),
                )}
              </nav>
              <AddSheet open={add.open} opts={add.opts} onClose={closeAdd} />
            </div>
          </AddCtx.Provider>
        </DataProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
