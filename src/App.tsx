import { Component, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { isTypeKey } from './data/itemTypes';
import { findUrl } from './data/util';
import { AutoSync } from './ui/sync';
import { AddCtx, DataProvider, ToastProvider, useData, type AddOptions } from './ui/context';
import type { TypeKey } from './data/model';
import { HOME, useRoute, type Route } from './ui/router';
import { AddSheet } from './screens/AddSheet';
import { Collection, Collections, InboxScreen } from './screens/Collections';
import { ItemDetail } from './screens/ItemDetail';
import { SearchScreen } from './screens/Search';
import { Settings, Trash } from './screens/Settings';
import { SourceDetail } from './screens/Sources';

function Screen({ route }: { route: Route }) {
  const [p, id] = route.path;
  switch (p) {
    case undefined:
    case 'verzamelingen': return <Collections />;
    case 'verzameling': return isTypeKey(id) ? <Collection key={id} type={id} /> : <Collections />;
    case 'inbox': return <InboxScreen />;
    case 'item': return <ItemDetail key={id} id={id} />;
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

/** Ronde Toevoegen-knop. Niet op de restaurantschermen (wens eigenaar): restaurants komen via de Inbox en Claude. */
function Fab({ route, collectionType, onAdd }: { route: Route; collectionType: TypeKey | null; onAdd: (o?: AddOptions) => void }) {
  const { itemById } = useData();
  const [p, id] = route.path;
  // Geen ronde + op restaurantschermen en op de paklijst (daar voeg je punten toe in de lijst zelf).
  const own = (t: string) => (p === 'verzameling' && id === t) || (p === 'item' && itemById.get(id)?.type === t);
  if (own('restaurant') || own('packing')) return null;
  return (
    <button type="button" className="fab" aria-label="Toevoegen" onClick={() => onAdd(collectionType ? { type: collectionType, openAfter: true } : {})}>
      <Plus size={30} strokeWidth={2.4} />
    </button>
  );
}

export default function App() {
  const route = useRoute();
  const [add, setAdd] = useState<{ open: boolean; opts: AddOptions }>({ open: false, opts: {} });
  const collectionType = route.path[0] === 'verzameling' && isTypeKey(route.path[1]) ? route.path[1] : null;

  const openAdd = useCallback((opts: AddOptions = {}) => setAdd({ open: true, opts }), []);
  const closeAdd = useCallback(() => setAdd((a) => ({ ...a, open: false })), []);

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
              {/* Eén hoofdscherm (Verzamelingen); Toevoegen is een vaste ronde knop rechtsonder. In een verzameling kiest hij die soort alvast. */}
              <Fab route={route} collectionType={collectionType} onAdd={openAdd} />
              <AddSheet open={add.open} opts={add.opts} onClose={closeAdd} />
            </div>
          </AddCtx.Provider>
        </DataProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
