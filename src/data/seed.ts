// Alleen proefversie: lijsten die Claude in de pagina heeft ingebouwd (voorstellenbestanden, zie INDELEN.md).
// Elke bundel wordt één keer toegepast; items die er al zijn (zelfde soort + titel) worden overgeslagen.
// Bij de eerste bundel gaan ongewijzigde voorbeeldgegevens weg, zodat je eigen lijsten niet tussen voorbeelden staan.
import { applyProposals, parseProposals } from './claude';
import { db } from './db';
import { getMeta, setMeta } from './repo';
import { removeSampleData } from './sample';
import { fold } from './util';

export interface SeedBundle {
  id: string;
  file: unknown;
}

declare global {
  interface Window {
    __BIJDEHAND_SEED?: SeedBundle[];
  }
}

export async function applySeedBundles(bundles: SeedBundle[]): Promise<number> {
  let applied = 0;
  for (const b of bundles) {
    const key = `seed:${b.id}`;
    if (await getMeta(key)) continue;
    if (!(await getMeta('seedSamplesCleared'))) {
      await removeSampleData();
      await setMeta('seedSamplesCleared', '1');
    }
    const items = await db.items.toArray();
    const parsed = parseProposals(JSON.stringify(b.file), items);
    if (!parsed.ok) {
      console.error('Bundel overgeslagen', b.id, parsed.error);
      continue;
    }
    const existing = new Set(items.filter((i) => !i.deletedAt).map((i) => `${i.type}|${fold(i.title)}`));
    const rows = parsed.value.rows.filter((r) => r.status === 'ok' && !(r.p.actie === 'nieuw' && existing.has(`${r.p.type}|${fold(r.p.titel ?? '')}`)));
    const res = await applyProposals(rows, parsed.value.rows);
    await setMeta(key, new Date().toISOString());
    // Voorbeelden niet opnieuw laden als alles later leeg wordt.
    await setMeta('previewSeeded', '1');
    applied += res.created + res.updated;
  }
  return applied;
}
