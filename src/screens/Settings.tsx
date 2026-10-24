import { useLiveQuery } from 'dexie-react-hooks';
import { Download, HardDrive, RotateCcw, Share2, Smartphone, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog, Empty, PreviewNotice, Section, Segmented, Sheet, TopBar, TypeIcon } from '../components/ui';
import { applyRestore, backupFileName, exportBackup, parseBackup, planRestore, type Backup, type RestoreMode, type RestorePlan } from '../data/backup';
import * as repo from '../data/repo';
import { loadSampleData, removeSampleData } from '../data/sample';
import { formatDateTime } from '../data/util';
import { useData, useToast } from '../ui/context';
import { navigate } from '../ui/router';
import { SyncSettings } from './SyncSettings';
import { canShareFiles as canShare, download } from '../ui/files';

declare global {
  interface Window {
    __installPrompt?: { prompt: () => Promise<void> } | null;
  }
}

async function makeBackupFile(): Promise<File> {
  const backup = await exportBackup();
  return new File([JSON.stringify(backup, null, 1)], backupFileName(), { type: 'application/json' });
}


function PlanSummary({ plan }: { plan: RestorePlan }) {
  if (plan.mode === 'replace') {
    return (
      <ul className="plan">
        <li><b>{plan.removed.items}</b> items en <b>{plan.removed.sources}</b> bronnen op dit apparaat worden vervangen</li>
        <li>daarna: <b>{plan.added.items}</b> items, <b>{plan.added.sources}</b> bronnen en <b>{plan.added.links}</b> koppelingen uit de back-up</li>
      </ul>
    );
  }
  return (
    <ul className="plan">
      <li><b>{plan.added.items}</b> nieuwe items, <b>{plan.added.sources}</b> nieuwe bronnen, <b>{plan.added.links}</b> koppelingen</li>
      <li><b>{plan.updated.items + plan.updated.sources}</b> bijgewerkt (versie in de back-up is nieuwer)</li>
      <li><b>{plan.kept.items + plan.kept.sources}</b> ongewijzigd (versie op dit apparaat is gelijk of nieuwer)</li>
      {plan.mergedSources > 0 && <li><b>{plan.mergedSources}</b> bronnen met dezelfde link samengevoegd</li>}
      <li>Niets op dit apparaat wordt verwijderd.</li>
    </ul>
  );
}

export function Settings() {
  const toast = useToast();
  const { items, sources, liveItems, liveSources } = useData();
  const lastExport = useLiveQuery(() => repo.getMeta(repo.META_LAST_EXPORT), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState<Backup | null>(null);
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [error, setError] = useState('');
  const [storage, setStorage] = useState<{ persisted: boolean | null; usage?: number; quota?: number }>({ persisted: null });
  const [canInstall, setCanInstall] = useState(!!window.__installPrompt);
  const canShareFiles = canShare();
  const sampleCount = liveItems.filter((i) => i.origin?.system === 'sample').length;
  const trash = items.filter((i) => i.deletedAt).length + sources.filter((s) => s.deletedAt).length;

  const refreshStorage = async () => {
    try {
      const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
      const est = navigator.storage?.estimate ? await navigator.storage.estimate() : {};
      setStorage({ persisted, usage: est.usage, quota: est.quota });
    } catch {
      setStorage({ persisted: null });
    }
  };
  useEffect(() => {
    void refreshStorage();
    const on = () => setCanInstall(!!window.__installPrompt);
    window.addEventListener('bijdehand:installable', on);
    return () => window.removeEventListener('bijdehand:installable', on);
  }, []);

  useEffect(() => {
    if (backup) void planRestore(backup, mode).then(setPlan);
  }, [backup, mode]);

  const doExport = async (share: boolean) => {
    try {
      const file = await makeBackupFile();
      if (share) {
        await navigator.share({ files: [file], title: 'Bijdehand back-up' });
      } else {
        download(file);
      }
      await repo.setMeta(repo.META_LAST_EXPORT, new Date().toISOString());
      toast(share ? 'Back-up gedeeld' : `Back-up opgeslagen als ${file.name}`);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast('Back-up maken is mislukt', { tone: 'error' });
    }
  };

  const onFile = async (f: File | undefined) => {
    setError('');
    if (!f) return;
    const r = parseBackup(await f.text());
    if (fileInput.current) fileInput.current.value = '';
    if (!r.ok) { setError(r.error); return; }
    setMode('merge');
    setBackup(r.backup);
  };

  const restore = async () => {
    if (!backup) return;
    try {
      if (mode === 'replace') {
        // Vangnet: eerst de huidige gegevens veiligstellen.
        download(await makeBackupFile());
      }
      const p = await applyRestore(backup, mode);
      setBackup(null);
      setConfirmReplace(false);
      toast(mode === 'replace' ? `Teruggezet: ${p.added.items} items, ${p.added.sources} bronnen` : `Samengevoegd: ${p.added.items} nieuw, ${p.updated.items + p.updated.sources} bijgewerkt`);
    } catch (e) {
      console.error(e);
      toast('Terugzetten is mislukt; er is niets gewijzigd.', { tone: 'error' });
    }
  };

  const mb = (n?: number) => (n === undefined ? '?' : n < 1e6 ? `${Math.max(1, Math.round(n / 1e3))} kB` : `${(n / 1e6).toFixed(1)} MB`);

  return (
    <div className="screen">
      <TopBar back="/verzamelingen" title="Instellingen" />
      <PreviewNotice />

      <SyncSettings />

      <Section title="Back-up">
        <p>Laatste back-up: <b>{lastExport ? formatDateTime(lastExport) : 'nog nooit'}</b></p>
        <p className="hint">Eén JSON-bestand met alle items, bronnen, koppelingen en eerdere versies ({liveItems.length} items, {liveSources.length} bronnen).</p>
        <div className="stack">
          <button type="button" className="btn btn-primary btn-block" onClick={() => void doExport(false)}><Download size={18} /> Back-up downloaden</button>
          {canShareFiles && <button type="button" className="btn btn-block" onClick={() => void doExport(true)}><Share2 size={18} /> Back-up delen (bijv. naar Drive)</button>}
          <label className="btn btn-block file-btn">
            <Upload size={18} /> Back-up terugzetten…
            <input ref={fileInput} type="file" accept="application/json,.json,text/plain" className="visually-hidden" onChange={(e) => void onFile(e.target.files?.[0])} aria-label="Back-upbestand kiezen" />
          </label>
        </div>
        {error && <p className="notice notice-error" role="alert">{error}</p>}
      </Section>

      <Section title="Opslag op dit apparaat">
        <p><HardDrive size={16} className="inline-icon" /> {mb(storage.usage)} in gebruik.{' '}
          {storage.persisted === true && 'Duurzame opslag is toegekend: de browser wist je gegevens niet bij ruimtegebrek.'}
          {storage.persisted === false && 'Duurzame opslag is (nog) niet toegekend: bij ruimtegebrek kan de browser gegevens wissen. Installeer de app op je startscherm en maak regelmatig een back-up.'}
          {storage.persisted === null && 'Deze browser meldt niet of de opslag duurzaam is.'}
        </p>
        {storage.persisted === false && (
          <button type="button" className="btn btn-small" onClick={async () => { await navigator.storage.persist(); await refreshStorage(); }}>Duurzame opslag aanvragen</button>
        )}
        <p className="hint">Synchronisatie met GitHub is bedoeld voor één toestel tegelijk (plus Claude). Een tweede toestel kan je gegevens wel ophalen bij het koppelen, maar wijzigingen op twee toestellen tegelijk worden nog niet samengevoegd.</p>
      </Section>

      <Section title="Installeren">
        {canInstall ? (
          <button type="button" className="btn btn-block" onClick={async () => { await window.__installPrompt?.prompt(); window.__installPrompt = null; setCanInstall(false); }}>
            <Smartphone size={18} /> Op startscherm zetten
          </button>
        ) : (
          <p className="hint">Op Android: open deze pagina in Chrome → menu (⋮) → <i>Toevoegen aan startscherm</i> of <i>App installeren</i>. Daarna verschijnt Bijdehand ook in het deelmenu van andere apps (nog niet getest op een toestel).</p>
        )}
      </Section>

      <Section title="Prullenbak">
        <button type="button" className="btn btn-block" onClick={() => navigate('/prullenbak')}><Trash2 size={18} /> Prullenbak openen ({trash})</button>
      </Section>

      <Section title="Voorbeeldgegevens">
        {sampleCount > 0 ? (
          <button type="button" className="btn btn-block" onClick={async () => { const r = await removeSampleData(); toast(`${r.removed} voorbeelden verwijderd${r.kept ? `, ${r.kept} aangepaste bewaard` : ''}`); }}>
            <RotateCcw size={18} /> Voorbeeldgegevens verwijderen ({sampleCount})
          </button>
        ) : (
          <button type="button" className="btn btn-block" onClick={async () => { const n = await loadSampleData(); toast(`${n} voorbeelditems geladen`); }}>Voorbeeldgegevens laden</button>
        )}
        <p className="hint">Voorbeelden die je hebt aangepast, blijven bij verwijderen bewaard.</p>
      </Section>

      <Section title="Wat nog niet kan">
        <ul className="plain">
          <li>Nog geen synchronisatie tussen twee toestellen tegelijk; wel automatisch opslaan in je privé GitHub-repo.</li>
          <li>Geen meldingen of herinneringen (ook niet voor klussen en planten).</li>
          <li>Titels en afbeeldingen van links worden niet automatisch opgehaald.</li>
          <li>Indelingsvoorstellen komen uit vaste woordregels, niet uit AI.</li>
          <li>Import uit Google Keep volgt in fase 2.</li>
        </ul>
        <p className="hint">Bijdehand 0.1 · fase 1</p>
      </Section>

      <Sheet
        open={!!backup}
        onClose={() => setBackup(null)}
        title="Back-up terugzetten"
        footer={
          <button type="button" className={`btn btn-block ${mode === 'replace' ? 'btn-danger' : 'btn-primary'}`} onClick={() => (mode === 'replace' ? setConfirmReplace(true) : void restore())}>
            {mode === 'replace' ? 'Alles vervangen…' : 'Samenvoegen'}
          </button>
        }
      >
        {backup && (
          <div className="stack">
            <p>Back-up van <b>{backup.exportedAt ? formatDateTime(backup.exportedAt) : 'onbekende datum'}</b>: {backup.counts.items} items, {backup.counts.sources} bronnen.</p>
            <Segmented label="Manier van terugzetten" value={mode} onChange={setMode} options={[{ value: 'merge', label: 'Samenvoegen' }, { value: 'replace', label: 'Alles vervangen' }]} />
            {plan && <PlanSummary plan={plan} />}
            {mode === 'replace' && <p className="notice">Voordat er iets wordt vervangen, wordt automatisch een back-up van de huidige gegevens gedownload.</p>}
          </div>
        )}
      </Sheet>
      <ConfirmDialog
        open={confirmReplace}
        title="Alles vervangen?"
        text="Alle items en bronnen op dit apparaat worden vervangen door de inhoud van de back-up. Er wordt eerst een vangnet-back-up gedownload."
        confirmLabel="Vervangen"
        danger
        onCancel={() => setConfirmReplace(false)}
        onConfirm={() => void restore()}
      />
    </div>
  );
}

export function Trash() {
  const toast = useToast();
  const { items, sources } = useData();
  const [confirm, setConfirm] = useState<null | { label: string; run: () => Promise<void> }>(null);
  const deleted = [
    ...items.filter((i) => i.deletedAt).map((i) => ({ kind: 'item' as const, id: i.id, title: i.title || 'Zonder titel', type: i.type, at: i.deletedAt! })),
    ...sources.filter((s) => s.deletedAt).map((s) => ({ kind: 'source' as const, id: s.id, title: s.title || s.site || s.url, type: null, at: s.deletedAt! })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="screen">
      <TopBar back="/instellingen" title="Prullenbak" sub="Blijft bewaard tot je het definitief verwijdert" />
      {deleted.length === 0 ? (
        <Empty icon={<Trash2 size={28} />} title="De prullenbak is leeg" />
      ) : (
        <>
          <div className="list">
            {deleted.map((d) => (
              <div key={d.id} className="card">
                <div className="card-main static">
                  <TypeIcon type={d.type} source={d.kind === 'source'} />
                  <span className="card-text">
                    <span className="card-title">{d.title}</span>
                    <span className="card-sub">Verwijderd {formatDateTime(d.at)}</span>
                  </span>
                </div>
                <button type="button" className="btn btn-small" aria-label={`${d.title} terugzetten`} onClick={async () => { await (d.kind === 'item' ? repo.restoreItem(d.id) : repo.restoreSource(d.id)); toast(`"${d.title}" teruggezet`); }}>
                  <RotateCcw size={16} /> Terug
                </button>
                <button type="button" className="icon-btn subtle" aria-label={`${d.title} definitief verwijderen`} onClick={() => setConfirm({ label: `"${d.title}"`, run: () => (d.kind === 'item' ? repo.purgeItem(d.id) : repo.purgeSource(d.id)) })}>
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-ghost danger" onClick={() => setConfirm({ label: `alle ${deleted.length} items in de prullenbak`, run: async () => { for (const d of deleted) await (d.kind === 'item' ? repo.purgeItem(d.id) : repo.purgeSource(d.id)); } })}>
            <Trash2 size={18} /> Prullenbak legen
          </button>
        </>
      )}
      <ConfirmDialog
        open={!!confirm}
        title="Definitief verwijderen?"
        text={<>Je verwijdert {confirm?.label} definitief, inclusief eerdere versies. Dit kan niet ongedaan worden gemaakt.</>}
        confirmLabel="Definitief verwijderen"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={async () => { await confirm?.run(); setConfirm(null); toast('Definitief verwijderd'); }}
      />
    </div>
  );
}
