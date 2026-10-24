// Bouwt de proefversie als één zelfstandig HTML-bestand (voor publicatie als claude.ai-artifact).
// Verschil met de echte app: geheugenrouter, geen service worker, melding "Proefversie".
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';

const out = 'dist-artifact';
execSync(`npx vite build --outDir ${out} --emptyOutDir`, { stdio: 'inherit', env: { ...process.env, VITE_PREVIEW: '1' } });

const assets = readdirSync(`${out}/assets`);
const js = assets.filter((f) => f.endsWith('.js'));
const css = assets.filter((f) => f.endsWith('.css'));
if (js.length !== 1) throw new Error(`Verwacht één JS-bundel, gevonden: ${js.join(', ')}`);

const style = css.map((f) => readFileSync(`${out}/assets/${f}`, 'utf8')).join('\n');
const script = readFileSync(`${out}/assets/${js[0]}`, 'utf8').replace(/<\/script/gi, '<\\/script');

// Lijsten die Claude klaarzette (persoonlijke gegevens): staan in .local/seed, nooit in git.
const seedDir = '.local/seed';
const seeds = existsSync(seedDir)
  ? readdirSync(seedDir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort().map((id) => ({ id, file: JSON.parse(readFileSync(`${seedDir}/${id}.json`, 'utf8')) }))
  : [];
const seedScript = seeds.length ? `<script>window.__BIJDEHAND_SEED = ${JSON.stringify(seeds).replace(/</g, '\\u003c')};</script>\n` : '';

const page = `<title>Bijdehand</title>
<meta name="description" content="Proefversie van Bijdehand, het persoonlijke geheugen dat Google Keep vervangt.">
<style>
${style}
</style>
<div id="root"></div>
${seedScript}<script type="module">
${script}
</script>
`;
writeFileSync(`${out}/bijdehand.html`, page);
console.log(`Proefversie: ${out}/bijdehand.html (${Math.round(page.length / 1024)} kB, ${seeds.length} klaargezette lijsten)`);
