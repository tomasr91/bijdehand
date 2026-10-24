// Hulpmiddel voor de Claude-taak die nieuwe items indeelt en restaurants opzoekt (zie docs/INDELEN.md → Dagelijkse taak).
//
//   npx tsx scripts/claude-taak.ts todo  <data-repo-map>
//       Toont als JSON wat er te doen is: Inbox-items en restaurants die nog niet zijn opgezocht,
//       zonder items waarvoor al een (nog niet verwerkt) voorstel klaarstaat. Plus bestaande schrijfwijzen.
//   npx tsx scripts/claude-taak.ts check <data-repo-map> <voorstellenbestand>
//       Controleert een voorstellenbestand met precies dezelfde regels als de app. Exit 1 bij fouten.
//
// Leest alleen; schrijft niets. Bevat geen gegevens.
import 'fake-indexeddb/auto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseBackup } from '../src/data/backup';
import { parseProposals } from '../src/data/claude';
import { TYPE_MAP, TYPES } from '../src/data/itemTypes';
import type { Item } from '../src/data/model';

const [cmd, dir, file] = process.argv.slice(2);
if (!cmd || !dir) {
  console.error('Gebruik: todo <data-repo-map> | check <data-repo-map> <voorstellenbestand>');
  process.exit(2);
}

function load(): { items: Item[]; exportedAt: string } {
  const p = join(dir, 'data', 'bijdehand.json');
  if (!existsSync(p)) return { items: [], exportedAt: '' };
  const r = parseBackup(readFileSync(p, 'utf8'));
  if (!r.ok) { console.error(`data/bijdehand.json ongeldig: ${r.error}`); process.exit(1); }
  return { items: r.backup.data.items, exportedAt: r.backup.exportedAt };
}

if (cmd === 'todo') {
  const { items, exportedAt } = load();
  const live = items.filter((i) => !i.deletedAt);
  // Items waarvoor al een voorstel klaarstaat dat de app nog niet verwerkte.
  const pending = new Set<string>();
  const vdir = join(dir, 'voorstellen');
  if (existsSync(vdir)) {
    for (const f of readdirSync(vdir).filter((n) => n.endsWith('.json'))) {
      try {
        const v = JSON.parse(readFileSync(join(vdir, f), 'utf8'));
        for (const p of v.voorstellen ?? []) {
          if (p.itemId) pending.add(p.itemId);
          if (p.zoek?.titel) pending.add(`zoek:${String(p.zoek.titel).toLowerCase()}`);
        }
      } catch { /* kapot bestand: de app laat het staan; hier negeren */ }
    }
  }
  const inbox = live.filter((i) => i.type === null && !pending.has(i.id))
    .map((i) => ({ id: i.id, titel: i.title, tekst: i.body, checklist: i.checklist.map((e) => e.text), tags: i.tags, bewaard: i.createdAt }));
  const restaurants = live.filter((i) => i.type === 'restaurant' && !i.fields.checkedAt && !pending.has(`zoek:${i.title.toLowerCase()}`))
    .map((i) => ({ titel: i.title, plaats: i.fields.city ?? null, velden: i.fields, notities: i.body }));
  const bekend: Record<string, Record<string, string[]>> = {};
  for (const t of TYPES) {
    for (const f of t.fields.filter((x) => x.kind === 'text' || x.kind === 'list')) {
      const vals = new Set<string>();
      for (const i of live.filter((x) => x.type === t.key)) {
        const v = i.fields[f.key];
        if (typeof v === 'string' && v.trim()) vals.add(v.trim());
        if (Array.isArray(v)) v.forEach((x) => vals.add(x));
      }
      if (vals.size && ['city', 'cuisine', 'traits', 'person', 'artist', 'author', 'platform', 'destination', 'location'].includes(f.key)) {
        (bekend[t.key] ??= {})[f.key] = [...vals].sort((a, b) => a.localeCompare(b, 'nl')).slice(0, 80);
      }
    }
  }
  const soorten = Object.fromEntries(TYPES.map((t) => [t.key, t.fields.filter((f) => !f.hidden).map((f) => ({ veld: f.key, label: f.label, soort: f.kind, ...(f.options ? { opties: f.options.map((o) => o.value) } : {}), ...(f.external ? { opgezocht: true } : {}) }))]));
  console.log(JSON.stringify({ gebaseerdOp: exportedAt, inbox, restaurantsOpzoeken: restaurants, bekend, soorten, wachtendeVoorstellen: pending.size }, null, 1));
} else if (cmd === 'check') {
  if (!file) { console.error('Geef het voorstellenbestand op.'); process.exit(2); }
  const { items } = load();
  const r = parseProposals(readFileSync(file, 'utf8'), items);
  if (!r.ok) { console.error(`Ongeldig bestand: ${r.error}`); process.exit(1); }
  let bad = 0;
  for (const row of r.value.rows) {
    const what = row.p.titel || row.p.zoek?.titel || row.item?.title || row.p.id;
    console.log(`${row.status.padEnd(9)} ${row.p.actie.padEnd(9)} ${row.p.type ? TYPE_MAP[row.p.type].label.padEnd(12) : ''.padEnd(12)} ${what}${row.problem ? ` — ${row.problem}` : ''}`);
    if (row.status === 'fout' || row.status === 'gewijzigd') bad++;
  }
  if (bad) { console.error(`${bad} voorstel(len) worden niet toegepast. Los dit op of haal ze weg.`); process.exit(1); }
  console.log('Alles in orde.');
} else {
  console.error(`Onbekend commando "${cmd}"`);
  process.exit(2);
}
