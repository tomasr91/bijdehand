// Instellingen → Synchronisatie: koppelen met de privé data-repo op GitHub (route 2).
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, CloudUpload, Link2Off, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { IS_PREVIEW, Section } from '../components/ui';
import { connect, disconnect, getSyncStatus, syncNow, SyncError } from '../data/sync';
import { formatDateTime } from '../data/util';
import { useToast } from '../ui/context';
import { describeApplied } from '../ui/sync';

export function SyncSettings() {
  const toast = useToast();
  const status = useLiveQuery(getSyncStatus, []);
  const [repoName, setRepoName] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [help, setHelp] = useState(false);

  if (IS_PREVIEW) {
    return (
      <Section title="Synchronisatie">
        <p className="hint">Koppelen met je privé GitHub-repo kan alleen in de geïnstalleerde app, niet in deze proefversie.</p>
      </Section>
    );
  }
  if (!status) return null;

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await syncNow();
      const parts = [r.merged && `${r.merged.items} items uit GitHub samengevoegd`, describeApplied(r), r.pushed ? 'opgeslagen in GitHub' : 'al bijgewerkt'].filter(Boolean);
      toast(parts.join(' · '));
    } catch (e) {
      setError(e instanceof SyncError ? e.message : 'Synchroniseren mislukte.');
    } finally {
      setBusy(false);
    }
  };

  const doConnect = async () => {
    setBusy(true);
    setError('');
    try {
      await connect(repoName || status.repo, token);
      setToken('');
      setBusy(false);
      await run();
    } catch (e) {
      setError(e instanceof SyncError ? e.message : 'Koppelen mislukte.');
      setBusy(false);
    }
  };

  return (
    <Section title="Synchronisatie">
      {status.connected ? (
        <>
          <p>Gekoppeld met <b>{status.repo}</b> (privé). Laatst bijgewerkt: <b>{status.lastAt ? formatDateTime(status.lastAt) : 'nog niet'}</b>.</p>
          <p className="hint">De app slaat je gegevens daar automatisch op (bij openen, elke minuut na een wijziging en bij wegschakelen) en verwerkt voorstellen die Claude daar klaarzet.</p>
          {(error || status.error) && <p className="notice notice-error" role="alert">{error || status.error}</p>}
          <div className="stack">
            <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={() => void run()}><RefreshCw size={18} /> {busy ? 'Bezig…' : 'Nu synchroniseren'}</button>
            <button type="button" className="btn btn-block" disabled={busy} onClick={async () => { await disconnect(); toast('Ontkoppeld. Je gegevens blijven op dit toestel en in GitHub staan.'); }}><Link2Off size={18} /> Ontkoppelen</button>
          </div>
        </>
      ) : (
        <>
          <p>Bewaar je gegevens automatisch in een <b>privé</b> GitHub-repo. Dan is er altijd een back-up, en kan Claude elke dag nieuwe items indelen en restaurants opzoeken.</p>
          <div className="field">
            <label htmlFor="sync-repo">Repo</label>
            <input id="sync-repo" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="gebruikersnaam/bijdehand-data" value={repoName || status.repo} onChange={(e) => setRepoName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="sync-token">Sleutel (fine-grained token)</label>
            <input id="sync-token" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="github_pat_…" value={token} onChange={(e) => setToken(e.target.value)} />
            <small className="hint">Blijft alleen op dit toestel. Gaat niet mee in back-ups en komt nooit in GitHub.</small>
          </div>
          {error && <p className="notice notice-error" role="alert">{error}</p>}
          <button type="button" className="btn btn-primary btn-block" disabled={busy || !token.trim() || !(repoName || status.repo).trim()} onClick={() => void doConnect()}>
            <CloudUpload size={18} /> {busy ? 'Bezig…' : 'Koppelen'}
          </button>
          <button type="button" className="btn btn-ghost r-edit-toggle" aria-expanded={help} onClick={() => setHelp(!help)}>
            Hoe maak ik een sleutel? <ChevronDown size={18} className={help ? 'rot' : ''} />
          </button>
          {help && (
            <ol className="plain-ol">
              <li>Open in je browser <b>github.com/settings/personal-access-tokens/new</b>.</li>
              <li>Naam: <i>Bijdehand telefoon</i>. Kies een vervaldatum (bijv. over een jaar).</li>
              <li>Repository access: <b>Only select repositories</b> → alleen je data-repo.</li>
              <li>Permissions → Repository permissions → <b>Contents: Read and write</b>. Verder niets.</li>
              <li><b>Generate token</b>, kopieer hem en plak hem hierboven. Deel hem met niemand, ook niet in een chat.</li>
            </ol>
          )}
        </>
      )}
    </Section>
  );
}
