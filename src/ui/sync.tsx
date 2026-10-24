// Automatisch synchroniseren met de privé data-repo (alleen als er gekoppeld is, nooit in de proefversie).
// Bij openen en terugkomen in de app: voorstellen van Claude ophalen en de stand opslaan.
// Tijdens gebruik: elke minuut opslaan als er iets veranderde, en meteen bij wegschakelen.
import { useEffect } from 'react';
import { IS_PREVIEW } from '../components/ui';
import { undoApply } from '../data/claude';
import { getSyncConfig, needsPush, syncNow, type SyncResult } from '../data/sync';
import { useToast } from './context';

export function describeApplied(r: SyncResult): string | null {
  const n = r.applied.updated + r.applied.created;
  if (!n) return null;
  const names = r.applied.titles.filter(Boolean);
  const list = names.slice(0, 3).join(', ') + (names.length > 3 ? ` en ${names.length - 3} meer` : '');
  return `Claude verwerkte ${n} ${n === 1 ? 'item' : 'items'}${list ? `: ${list}` : ''}`;
}

export function AutoSync() {
  const toast = useToast();
  useEffect(() => {
    if (IS_PREVIEW) return;
    let alive = true;
    const run = async (onlyIfChanged: boolean) => {
      try {
        if (!(await getSyncConfig())) return;
        if (onlyIfChanged && !(await needsPush())) return;
        const r = await syncNow();
        const msg = alive ? describeApplied(r) : null;
        if (msg) {
          toast(msg, {
            action: {
              label: 'Ongedaan maken',
              run: async () => {
                for (const u of [...r.undo].reverse()) await undoApply(u);
                toast('Teruggedraaid');
              },
            },
          });
        }
      } catch {
        // De fout staat in Instellingen → Synchronisatie; niet bij elke poging een melding.
      }
    };
    void run(false);
    const onVisible = () => void run(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void run(true); }, 60_000);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [toast]);
  return null;
}
