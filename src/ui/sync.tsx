// Automatisch synchroniseren met de privé data-repo (alleen als er gekoppeld is).
// Bij openen en terugkomen in de app: voorstellen van Claude ophalen en de stand opslaan.
// Tijdens gebruik: elke minuut opslaan als er iets veranderde, en meteen bij wegschakelen.
import { useEffect } from 'react';
import { undoApply } from '../data/claude';
import { getSyncConfig, needsPush, syncNow, type SyncResult } from '../data/sync';
import { geocodeMissing, missingGeocodeIds } from '../data/geocode';
import { repairDuplicates } from '../data/repair';
import { useToast } from './context';

export function describeApplied(r: SyncResult): string | null {
  const n = r.applied.updated + r.applied.created;
  const trashed = r.applied.trashed;
  if (!n && !trashed) return null;
  const names = r.applied.titles.filter(Boolean);
  const list = names.slice(0, 3).join(', ') + (names.length > 3 ? ` en ${names.length - 3} meer` : '');
  const main = n ? `Claude verwerkte ${n} ${n === 1 ? 'item' : 'items'}${list ? `: ${list}` : ''}` : 'Claude ruimde op';
  return trashed ? `${main} · ${trashed} naar prullenbak` : main;
}

export function AutoSync() {
  const toast = useToast();
  useEffect(() => {
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
    // Restaurants zonder punt op de kaart: op de achtergrond opzoeken (standaard, niet pas als de kaart open is).
    const locate = async () => {
      try {
        if (!navigator.onLine) return;
        const ids = await missingGeocodeIds();
        if (ids.length) await geocodeMissing(ids);
      } catch {
        // Lukt het nu niet, dan de volgende keer; de kaart meldt het als je hem opent.
      }
    };
    // Eerst dubbele kopieën opruimen (zie repair.ts), dan synchroniseren, dan locaties.
    void repairDuplicates()
      .then((ids) => { if (ids.length && alive) toast(`${ids.length} dubbele ${ids.length === 1 ? 'item' : 'items'} naar de prullenbak`); })
      .catch(() => {})
      .then(() => run(false))
      .then(locate);
    const onVisible = () => {
      void run(document.visibilityState === 'hidden');
      if (document.visibilityState === 'visible') void locate();
    };
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
