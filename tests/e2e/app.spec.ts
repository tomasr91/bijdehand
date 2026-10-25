import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sampleBackup } from '../../src/data/testdata';

// Kernstromen uit ROADMAP.md → "Geslaagde eerste versie". Draait op 360 px; lay-out ook op 412 px en desktop (playwright.config.ts).

/** De ronde Toevoegen-knop rechtsonder (er is geen navigatiebalk meer). */
const addBtn = (page: Page) => page.getByRole('button', { name: 'Toevoegen', exact: true });

/** Verzonnen testgegevens (src/data/testdata.ts) terugzetten als back-up via Instellingen. */
async function loadSamples(page: Page) {
  // Vaste ASCII-bestandsnaam: bij mappen met bijv. "ë" kwam de bestandskeuze niet aan.
  const file = join(tmpdir(), `bijdehand-testdata-${test.info().workerIndex}.json`);
  writeFileSync(file, JSON.stringify(sampleBackup()));
  await page.goto('/#/instellingen');
  await page.getByLabel('Back-upbestand kiezen').setInputFiles(file);
  await page.getByRole('dialog', { name: 'Back-up terugzetten' }).getByRole('button', { name: 'Samenvoegen' }).last().click();
  await expect(page.getByText(/Samengevoegd: \d+ nieuw/)).toBeVisible();
  await settle(page);
}

/** Wacht tot een gesloten sheet zijn geschiedenis-item heeft opgeruimd (voorkomt races met reload/goto). */
async function settle(page: Page) {
  await page.waitForFunction(() => !history.state?.sheet);
}

async function noHorizontalScroll(page: Page) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw, 'pagina scrolt horizontaal').toBeLessThanOrEqual(iw);
}

/** Alle zichtbare knoppen en links moeten minstens 44 px hoog zijn (tekstlinks in een zin uitgezonderd). */
async function touchTargetsOk(page: Page) {
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, a, [role="checkbox"], input:not([type="file"]):not([type="checkbox"])')]
      .filter((el) => !el.classList.contains('link-btn') && !el.classList.contains('visually-hidden') && el.offsetParent !== null && !el.closest('.capture-lines') && !el.closest('.leaflet-control-attribution'))
      .map((el) => ({ el: el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30) || el.tagName, h: el.getBoundingClientRect().height }))
      .filter((x) => x.h > 0 && x.h < 43.5),
  );
  expect(small, 'te kleine aanraakvlakken').toEqual([]);
}

test('hoofdschermen: geen horizontaal scrollen, ruime aanraakvlakken, geen fouten', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await loadSamples(page);
  for (const path of ['/verzamelingen', '/verzameling/restaurant', '/verzameling/album', '/verzameling/packing', '/inbox', '/zoeken?q=gent', '/instellingen', '/prullenbak']) {
    await page.goto(`/#${path}`);
    await page.waitForTimeout(150);
    await noHorizontalScroll(page);
    await touchTargetsOk(page);
  }
  await page.goto('/#/verzameling/restaurant');
  await page.getByRole('button', { name: /Trattoria/ }).click();
  await noHorizontalScroll(page);
  await touchTargetsOk(page);
  expect(errors).toEqual([]);
});

test('snel bewaren zonder soort → Inbox → voorstel → indelen; blijft na herladen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bijdehand', level: 1 })).toBeVisible(); // startpagina = verzamelingen
  await expect(page.getByRole('navigation')).toHaveCount(0); // geen navigatiebalk meer
  await addBtn(page).click();
  const sheet = page.getByRole('dialog', { name: 'Iets bewaren' });
  await sheet.getByLabel('Tekst').fill('Restaurant De Zwaan proberen\nAanrader van Sanne');
  await expect(sheet.getByRole('button', { name: /Restaurant\?/ })).toBeVisible();
  await sheet.getByRole('button', { name: 'Bewaren' }).click();
  await expect(page.getByText('Bewaard in Inbox')).toBeVisible();

  await settle(page);
  await page.reload();
  await page.getByRole('button', { name: /Inbox · 1 nog in te delen/ }).click();
  await page.getByRole('button', { name: /Restaurant De Zwaan proberen/ }).click();
  await expect(page.getByText('Aanrader van Sanne')).toBeVisible();
  await page.getByRole('button', { name: 'Indelen', exact: true }).click();
  await expect(page.getByText('Ingedeeld bij Restaurants')).toBeVisible();
  await page.getByRole('button', { name: 'Gegevens bewerken' }).click();
  await page.getByLabel('Plaats').fill('Zwolle');
  const score = page.getByLabel('Mijn cijfer (1 tot 10)');
  await score.fill('11');
  await score.blur();
  await expect(page.getByRole('alert').getByText(/cijfer van 1 tot 10/)).toBeVisible();
  await score.fill('7.46');
  await score.blur();
  await expect(score).toHaveValue('7,5');
  await page.getByRole('button', { name: 'Favoriet' }).click();
  await expect(page.getByRole('button', { name: 'Favoriet' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status').getByText('Opgeslagen')).toBeVisible();

  await settle(page);
  await page.reload();
  await expect(page.getByText('Zwolle', { exact: true })).toBeVisible(); // kop: plaats · keuken
  await expect(page.getByLabel('Mijn cijfer (1 tot 10)')).toHaveValue('7,5');
  await expect(page.getByRole('button', { name: 'Favoriet' })).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/#/verzameling/restaurant');
  await expect(page.getByRole('heading', { name: /Zwolle/ })).toBeVisible();
  const row = page.getByRole('button', { name: /Restaurant De Zwaan proberen/ });
  await expect(row).toContainText('7,5');
  await expect(row.getByRole('img', { name: 'Favoriet' })).toBeVisible();
  // Filter "geweest" volgt uit het cijfer.
  await page.getByRole('radio', { name: 'Nog niet geweest' }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole('radio', { name: 'Geweest', exact: true }).click();
  await expect(row).toBeVisible();
});

test('checklist aanmaken, afvinken en terugvinden na herladen', async ({ page }) => {
  await page.goto('/');
  await addBtn(page).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('radio', { name: 'Checklist' }).click();
  await sheet.getByLabel('Naam van de lijst').fill('Boodschappen zaterdag');
  for (const p of ['Brood', 'Kaas', 'Appels']) {
    await sheet.getByLabel('Punt toevoegen').fill(p);
    await sheet.getByLabel('Punt toevoegen').press('Enter');
  }
  await sheet.getByRole('button', { name: 'Bewaren' }).click();
  await page.getByRole('button', { name: 'Openen' }).click();
  await page.getByRole('checkbox', { name: 'Kaas' }).click();
  await expect(page.getByText('1 van 3 afgevinkt')).toBeVisible();
  await settle(page);
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Kaas' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('checkbox', { name: 'Brood' })).toHaveAttribute('aria-checked', 'false');
});

test('paklijst: één lijst, hele lijst plakken, afvinken, alles uitvinken, aanvullen via Toevoegen', async ({ page }) => {
  // Een geplakte lijst met meerdere regels wordt per regel een punt (niet samengevoegd in één veld).
  const paste = async (field: ReturnType<Page['getByLabel']>, text: string) => {
    await field.focus();
    await field.evaluate((el, t) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', t);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, text);
  };
  await page.goto('/#/verzameling/packing');
  await page.getByRole('button', { name: 'Paklijst maken' }).click();
  await expect(page.getByText('Nog geen punten')).toBeVisible();
  await expect(addBtn(page)).toHaveCount(0); // geen ronde + op de paklijst
  await expect(page.getByRole('heading', { name: 'Tags' })).toHaveCount(0); // alleen de checklist
  await paste(page.getByLabel('Punt toevoegen'), '- Paspoorten\nZonnebrand\n\nOplader telefoon\nSlippers\nPet');
  await expect(page.getByText('0 van 5 ingepakt')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Paspoorten' }).click();
  await page.getByRole('checkbox', { name: 'Pet' }).click();
  await expect(page.getByText('2 van 5 ingepakt')).toBeVisible();
  await page.getByRole('button', { name: 'Alles uitvinken' }).click();
  await expect(page.getByText('0 van 5 ingepakt')).toBeVisible();
  await page.getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(page.getByText('2 van 5 ingepakt')).toBeVisible();
  await touchTargetsOk(page);

  // Hoofdscherm: de tegel opent meteen de paklijst (geen tussenscherm).
  await page.goto('/#/verzamelingen');
  await page.getByRole('button', { name: /^Paklijst/ }).click();
  await expect(page.getByText('2 van 5 ingepakt')).toBeVisible();

  // Toevoegen met soort Paklijst maakt geen tweede lijst maar vult deze aan (zonder dubbele punten).
  await page.goto('/#/verzamelingen');
  await addBtn(page).click();
  const sheet = page.getByRole('dialog', { name: 'Iets bewaren' });
  await sheet.getByLabel('Tekst').fill('Zonnebrand\nZwembroek');
  await sheet.getByRole('button', { name: /^Soort:/ }).click();
  await page.getByRole('dialog', { name: 'Soort kiezen' }).getByRole('button', { name: 'Paklijsten' }).click();
  await page.getByRole('dialog', { name: 'Nieuw: paklijst' }).getByRole('button', { name: 'Bewaren' }).click();
  await expect(page.getByText('1 punt toegevoegd aan de paklijst')).toBeVisible();
  await expect(page.getByText('2 van 6 ingepakt')).toBeVisible();
  await page.goto('/#/verzameling/packing');
  await expect(page.getByText('2 van 6 ingepakt')).toBeVisible(); // nog steeds dezelfde lijst
});

test('zoeken met een vraag en met filters', async ({ page }) => {
  await loadSamples(page);
  await page.goto('/#/zoeken');
  await page.getByRole('button', { name: 'Welke albums wil ik nog ontdekken?' }).click();
  await expect(page.getByText('1 resultaat')).toBeVisible();
  await expect(page.getByRole('button', { name: /In Rainbows/ })).toBeVisible();
  await page.getByLabel('Zoeken', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Alle soorten' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Albums' }).click();
  await page.getByRole('radio', { name: 'Geluisterd' }).click();
  await expect(page.getByRole('button', { name: /Kind of Blue/ })).toBeVisible();
  await expect(page.getByText('1 resultaat')).toBeVisible();
});

test('verwijderen, ongedaan maken en terugzetten uit de prullenbak', async ({ page }) => {
  await loadSamples(page);
  await page.goto('/#/verzameling/album');
  await page.getByRole('button', { name: /Hounds of Love/ }).click();
  await page.getByRole('button', { name: 'Meer acties' }).click();
  await page.getByRole('button', { name: 'Naar prullenbak' }).click();
  await expect(page.getByRole('button', { name: /Hounds of Love/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Albums' })).toBeVisible();
  await page.getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(page.getByRole('button', { name: /Hounds of Love/ })).toBeVisible();

  await page.getByRole('button', { name: /Hounds of Love/ }).click();
  await page.getByRole('button', { name: 'Meer acties' }).click();
  await page.getByRole('button', { name: 'Naar prullenbak' }).click();
  await expect(page.getByRole('heading', { name: 'Albums' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Hounds of Love/ })).toHaveCount(0);
  await page.goto('/#/prullenbak');
  await page.getByRole('button', { name: 'Hounds of Love terugzetten' }).click();
  await expect(page.getByText('"Hounds of Love" teruggezet')).toBeVisible();
  await page.goto('/#/verzameling/album');
  await expect(page.getByRole('button', { name: /Hounds of Love/ })).toBeVisible();
});

test('back-up exporteren en in een lege app terugzetten', async ({ page, browser }, info) => {
  await loadSamples(page);
  await page.goto('/#/instellingen');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Back-up downloaden' }).click()]);
  const file = info.outputPath('backup.json');
  await download.saveAs(file);
  const json = JSON.parse(readFileSync(file, 'utf8'));
  expect(json.format).toBe('bijdehand-backup');
  expect(json.data.items).toHaveLength(12);
  await expect(page.getByText('Laatste back-up: nog nooit')).toHaveCount(0);

  // Schone browser = leeg apparaat.
  const ctx = await browser.newContext({ ...info.project.use });
  const fresh = await ctx.newPage();
  await fresh.goto('/#/instellingen');
  await fresh.getByLabel('Back-upbestand kiezen').setInputFiles(file);
  const dlg = fresh.getByRole('dialog', { name: 'Back-up terugzetten' });
  await expect(dlg.getByText('12 nieuwe items')).toBeVisible();
  await dlg.getByRole('button', { name: 'Samenvoegen' }).last().click();
  await expect(fresh.getByText(/Samengevoegd: 12 nieuw/)).toBeVisible();
  await fresh.goto('/#/verzameling/restaurant');
  await expect(fresh.getByRole('button', { name: /Trattoria Da Marco/ })).toBeVisible();
  await fresh.goto('/#/zoeken?q=Graslei');
  await expect(fresh.getByRole('button', { name: /Graslei/ }).first()).toBeVisible();

  // Nogmaals terugzetten: niets dubbel.
  await fresh.goto('/#/instellingen');
  await fresh.getByLabel('Back-upbestand kiezen').setInputFiles(file);
  await expect(fresh.getByRole('dialog').getByText('0 nieuwe items')).toBeVisible();
  await ctx.close();
});

test('ongeldig back-upbestand wordt geweigerd', async ({ page }, info) => {
  await page.goto('/#/instellingen');
  const file = info.outputPath('kapot.json');
  writeFileSync(file, '{"format":"iets anders"}');
  await page.getByLabel('Back-upbestand kiezen').setInputFiles(file);
  await expect(page.getByRole('alert')).toHaveText('Dit is geen Bijdehand-back-up.');
});

test('link via deelmenu-parameters komt in de Inbox en wordt niet dubbel bewaard', async ({ page }) => {
  // Simuleert wat Android na delen opent (share_target in manifest). Het deelmenu zelf is niet te testen in deze omgeving.
  await page.goto('/?title=Mooi%20artikel&text=Lees%20dit%20https%3A%2F%2Fexample.org%2Fartikel%3Futm_source%3Dx');
  const sheet = page.getByRole('dialog', { name: 'Iets bewaren' });
  await expect(sheet.getByLabel('Link')).toHaveValue('https://example.org/artikel?utm_source=x');
  await expect(sheet.getByLabel('Titel')).toHaveValue('Mooi artikel');
  await sheet.getByLabel('Eigen notitie').fill('Voor het weekend');
  await sheet.getByRole('button', { name: 'Bewaren' }).click();
  await expect(page.getByText('Bewaard in Inbox')).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
  await settle(page);

  await page.goto('/?url=https%3A%2F%2Fwww.example.org%2Fartikel');
  await expect(page.getByRole('dialog').getByText(/al bewaard/)).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Bewaren' }).click();
  await expect(page.getByText('Deze link heb je al bewaard bij "Mooi artikel"')).toBeVisible();
  await settle(page);
  await page.goto('/#/inbox');
  await expect(page.getByRole('button', { name: /Mooi artikel/ })).toHaveCount(1);
  await page.getByRole('button', { name: /Mooi artikel/ }).click();
  await page.getByRole('button', { name: /example\.org/ }).first().click();
  await expect(page.getByText('titel uit het deelmenu')).toBeVisible();
  await expect(page.getByLabel('Mijn notitie')).toHaveValue('Voor het weekend');
});

test('terugknop sluit eerst de sheet, daarna terug naar vorig scherm', async ({ page }) => {
  await loadSamples(page);
  await page.goto('/#/verzamelingen');
  await page.getByRole('button', { name: /Albums/ }).click();
  await addBtn(page).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Albums' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Bijdehand' })).toBeVisible();
});

test('restaurantlijst plakken: per plaats gegroepeerd, filter op kenmerk, kenmerk toevoegen', async ({ page }) => {
  await page.goto('/#/verzameling/restaurant');
  await page.getByRole('button', { name: 'Lijst plakken' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Lijst plakken in Restaurants' });
  await sheet.getByLabel('Geplakte lijst').fill('Leiden - Pamir (Afghaans)\nLeiden - erfgoed (fancy)\nLeiden - restaurant 512 (fancy)\nZwolle - het hoekje (kleine gerechtjes, reserveren)\nLeiden - Pamir');
  await expect(sheet.getByText('Staat er al — wordt overgeslagen')).toHaveCount(1);
  await sheet.getByRole('button', { name: '4 toevoegen' }).click();
  await expect(page.getByText('4 restaurants toegevoegd')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Leiden · 3/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Zwolle · 1/ })).toBeVisible();

  await page.getByRole('button', { name: 'Filter op label' }).click();
  await page.getByRole('dialog', { name: 'Filter' }).getByRole('radio', { name: /^fancy/ }).click();
  await settle(page);
  await expect(page.getByRole('button', { name: /Erfgoed/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Pamir/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Filter fancy weghalen' }).click();

  await page.getByRole('button', { name: /Pamir/ }).click();
  await expect(page.getByText('Leiden · Afghaans')).toBeVisible();
  await page.getByRole('button', { name: 'Gegevens bewerken' }).click();
  await expect(page.getByLabel('Keuken')).toHaveValue('Afghaans');
  await page.getByRole('button', { name: 'set menu' }).click();
  await expect(page.getByRole('button', { name: 'set menu verwijderen' })).toBeVisible();
  await settle(page);
  await page.reload();
  await expect(page.getByRole('list', { name: 'Labels' }).getByText('set menu')).toBeVisible();
});

/** Nagebootste GitHub (Contents API) in het geheugen van de test. */
async function fakeGitHub(page: Page) {
  const files = new Map<string, { sha: string; text: string }>();
  let n = 0;
  const TOKEN = 'github_pat_e2e_0123456789abcdefghij';
  await page.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const ok = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (req.headers()['authorization'] !== `Bearer ${TOKEN}`) return ok(401, { message: 'Bad credentials' });
    const m = url.pathname.match(/^\/repos\/[^/]+\/[^/]+(\/contents\/(.*))?$/);
    if (!m) return ok(404, {});
    if (!m[1]) return ok(200, { private: true });
    const path = decodeURIComponent(m[2]);
    const method = req.method();
    if (method === 'GET') {
      const f = files.get(path);
      if (f) return ok(200, { sha: f.sha, content: Buffer.from(f.text).toString('base64'), encoding: 'base64' });
      const dir = [...files.keys()].filter((p) => p.startsWith(path + '/'));
      if (dir.length) return ok(200, dir.map((p) => ({ name: p.split('/').pop(), path: p, sha: files.get(p)!.sha, type: 'file' })));
      return ok(404, { message: 'Not Found' });
    }
    const body = req.postDataJSON();
    if (method === 'PUT') {
      files.set(path, { sha: `s${++n}`, text: Buffer.from(body.content, 'base64').toString('utf8') });
      return ok(201, {});
    }
    if (method === 'DELETE') { files.delete(path); return ok(200, {}); }
    return ok(405, {});
  });
  return { files, TOKEN };
}

/** Koppelen in Instellingen met de nagebootste GitHub. */
async function connectSync(page: Page, TOKEN: string) {
  await page.goto('/#/instellingen');
  await page.getByLabel('Repo').fill('iemand/bijdehand-data');
  await page.getByLabel('Sleutel (fine-grained token)').fill(TOKEN);
  await page.getByRole('button', { name: 'Koppelen' }).click();
  await expect(page.getByText(/Gekoppeld met/)).toBeVisible();
}

test('restaurant: websiteknop in detail, cijfers en prijsniveau (tijdelijk) niet in beeld', async ({ page }) => {
  await page.goto('/#/verzameling/restaurant');
  await page.getByRole('button', { name: 'Lijst plakken' }).click();
  const paste = page.getByRole('dialog', { name: 'Lijst plakken in Restaurants' });
  await paste.getByLabel('Geplakte lijst').fill('Leiden - Pamir (Afghaans)');
  await paste.getByRole('button', { name: /toevoegen/ }).click();
  await settle(page);
  const { files, TOKEN } = await fakeGitHub(page);
  await connectSync(page, TOKEN);
  files.set('voorstellen/aanvulling.json', { sha: 'a1', text: JSON.stringify({
    format: 'bijdehand-voorstellen', formatVersion: 1, voorstellen: [
      { id: 'a1', actie: 'aanvullen', type: 'restaurant', zoek: { titel: 'Pamir', city: 'Leiden' }, velden: { website: 'http://pamir.example/', googleRating: 4.7, priceLevel: '€€', summary: 'Afghaans restaurant aan de Breestraat.', venue: 'finedining', michelin: 'Bib Gourmand', experience: true, traits: ['afghaans', 'set menu', 'bib gourmand', 'vega-opties'] } },
    ],
  }) });
  await page.getByRole('button', { name: 'Nu synchroniseren' }).click();
  await expect(page.getByText(/Claude verwerkte 1 item: Pamir/)).toBeVisible();
  await page.goto('/#/verzameling/restaurant');
  const card = page.getByRole('button', { name: /Pamir/ });
  await expect(card).not.toContainText('Afghaans restaurant'); // kaartje: geen samenvatting
  await expect(card).not.toContainText('Wil proberen');
  // Kaartje: de eerste drie labels onder de naam (fine dining vooraan), geen symbolen.
  await expect(card).toContainText('Fine dining, afghaans, set menu');
  await expect(card).not.toContainText('bib gourmand');
  await expect(card.getByRole('img')).toHaveCount(0);
  await expect(card).not.toContainText('4,7');
  await expect(card).not.toContainText('€');
  await card.click();
  await expect(page.getByText('Afghaans restaurant aan de Breestraat.')).toBeVisible();
  const site = page.getByRole('link', { name: 'Website pamir.example' });
  await expect(site).toHaveAttribute('href', 'http://pamir.example/');
  await expect(site).toHaveAttribute('target', '_blank');
  const route = page.getByRole('link', { name: 'Route in Google Maps' });
  await expect(route).toHaveAttribute('href', 'https://www.google.com/maps/search/?api=1&query=Pamir%2C%20Leiden');
  await expect(page.getByLabel('Google-cijfer (van 5)')).toHaveCount(0);
  // Sober detail: geen Claude-melding, opgezochte gegevens, links, tags of geschiedenis; wel notities.
  await expect(page.getByText(/Ingevuld door Claude/)).toHaveCount(0);
  await expect(page.getByText(/Opgezocht op/)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Links en verbanden' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Tags' })).toHaveCount(0);
  await expect(page.getByLabel('Mijn notities')).toBeVisible();
  await expect(page.getByText(/Google 4,7/)).toHaveCount(0);
  await touchTargetsOk(page);
  await noHorizontalScroll(page);
});

test('synchroniseren met privé GitHub-repo: koppelen, voorstel van Claude automatisch toepassen', async ({ page }) => {
  const { files, TOKEN } = await fakeGitHub(page);

  await page.goto('/');
  for (const t of ['Pamir Leiden', 'Lezen\nKlara and the Sun']) {
    await addBtn(page).click();
    await page.getByRole('dialog').getByLabel('Tekst').fill(t);
    await page.getByRole('dialog').getByRole('button', { name: 'Bewaren' }).click();
    await settle(page);
  }

  await page.goto('/#/instellingen');
  await page.getByLabel('Repo').fill('iemand/bijdehand-data');
  await page.getByLabel('Sleutel (fine-grained token)').fill('github_pat_fout_00000000000000000000');
  await page.getByRole('button', { name: 'Koppelen' }).click();
  await expect(page.getByRole('alert').getByText(/ongeldig of verlopen/)).toBeVisible();
  await page.getByLabel('Sleutel (fine-grained token)').fill(TOKEN);
  await page.getByRole('button', { name: 'Koppelen' }).click();
  await expect(page.getByText(/Gekoppeld met/)).toBeVisible();
  await expect.poll(() => files.has('data/bijdehand.json')).toBe(true);
  const stored = JSON.parse(files.get('data/bijdehand.json')!.text);
  expect(stored.data.items.map((i: { title: string }) => i.title)).toContain('Pamir Leiden');
  expect(files.get('data/bijdehand.json')!.text).not.toContain(TOKEN);

  // Claude zet een voorstel klaar; bij de volgende synchronisatie wordt het automatisch toegepast.
  const note = stored.data.items.find((i: { title: string }) => i.title === 'Pamir Leiden');
  const lezen = stored.data.items.find((i: { title: string }) => i.title.startsWith('Lezen'));
  files.set('voorstellen/2026-10-25.json', { sha: 'v1', text: JSON.stringify({
    format: 'bijdehand-voorstellen', formatVersion: 1, gebaseerdOp: stored.exportedAt,
    voorstellen: [
      { id: 'v1', actie: 'indelen', itemId: note.id, type: 'restaurant', titel: 'Pamir', velden: { city: 'Leiden', cuisine: 'Afghaans', traits: ['afghaans'] } },
      { id: 'v2', actie: 'nieuw', itemId: lezen.id, type: 'album', titel: 'Klara and the Sun', velden: { status: 'ontdekken' } },
    ],
  }) });
  await page.getByRole('button', { name: 'Nu synchroniseren' }).click();
  await expect(page.getByText(/Claude verwerkte 2 items/)).toBeVisible();
  expect(files.has('voorstellen/2026-10-25.json')).toBe(false);
  await page.goto('/#/verzameling/restaurant');
  await expect(page.getByRole('button', { name: /Pamir/ })).toContainText(/afghaans/i);
  await touchTargetsOk(page);
  // Andere soorten: "Ingevuld door Claude" tot je het controleert.
  await page.goto('/#/verzameling/album');
  await page.getByRole('button', { name: /Klara and the Sun/ }).click();
  await expect(page.getByText(/Ingevuld door Claude/)).toBeVisible();
  await page.getByRole('button', { name: 'Gecontroleerd' }).click();
  await expect(page.getByText(/Ingevuld door Claude/)).toHaveCount(0);
});

test('kaart met restaurants: locaties opzoeken, punten, openen; zonder adres apart', async ({ page }) => {
  // OpenStreetMap nagebootst: adreszoeker en (lege) kaarttegels.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  await page.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: png }));
  const asked: string[] = [];
  await page.route('https://api.pdok.nl/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { docs: [] } }) }));
  await page.route('https://nominatim.openstreetmap.org/**', (r) => {
    const q = new URL(r.request().url()).searchParams.get('q') ?? '';
    asked.push(q);
    const hits: Record<string, [string, string]> = { 'Breestraat 10, Leiden': ['52.1590', '4.4900'], 'Haarlemmerstraat 5, Leiden': ['52.1610', '4.4920'] };
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(hits[q] ? [{ lat: hits[q][0], lon: hits[q][1] }] : []) });
  });
  await page.goto('/#/verzameling/restaurant');
  await page.getByRole('button', { name: 'Lijst plakken' }).click();
  const paste = page.getByRole('dialog', { name: 'Lijst plakken in Restaurants' });
  await paste.getByLabel('Geplakte lijst').fill('Leiden - Pamir (Afghaans)\nLeiden - Groen\nLeiden - Het Smulhof');
  await paste.getByRole('button', { name: /toevoegen/ }).click();
  await settle(page);
  // Adressen invullen (zoals Claude doet): twee vindbaar, één niet.
  for (const [name, addr] of [['Pamir', 'Breestraat 10'], ['Groen', 'Haarlemmerstraat 5 (hoek)'], ['Het smulhof', 'Wisselende locatie']]) {
    await page.goto('/#/verzameling/restaurant');
    await page.getByRole('button', { name: new RegExp(name, 'i') }).first().click();
    await page.getByRole('button', { name: 'Gegevens bewerken' }).click();
    await page.getByLabel('Adres of buurt').fill(addr);
    await page.getByLabel('Adres of buurt').blur();
    await settle(page);
  }
  await page.goto('/#/verzameling/restaurant');
  await page.getByRole('button', { name: 'Kaart tonen' }).click();
  await expect(page.getByRole('region', { name: 'Kaart met restaurants' })).toBeVisible();
  await expect(page.locator('.map-pin')).toHaveCount(2, { timeout: 10_000 });
  // Punten staan op hun plek (bug: ze stonden onder elkaar gestapeld): Groen ligt noordoostelijk van Pamir.
  const pin = async (t: string) => (await page.locator(`.map-pin[title="${t}"]`).boundingBox())!;
  const [pamir, groen] = [await pin('Pamir'), await pin('Groen')];
  expect(groen.x).toBeGreaterThan(pamir.x);
  expect(groen.y).toBeLessThan(pamir.y);
  await expect.poll(() => [...asked].sort()).toEqual(['Breestraat 10, Leiden', 'Haarlemmerstraat 5, Leiden', 'Wisselende locatie, Leiden']);
  await expect(page.getByText(/Locaties opzoeken/)).toHaveCount(0); // klaar met opzoeken
  await page.getByRole('button', { name: '1 zonder locatie' }).click();
  await expect(page.getByRole('button', { name: /Het smulhof/i })).toBeVisible();
  await touchTargetsOk(page);
  await noHorizontalScroll(page);
  // Kaart blijft de gekozen weergave; tweede keer niets opnieuw opzoeken.
  await page.reload();
  await expect(page.locator('.map-pin')).toHaveCount(2);
  expect(asked).toHaveLength(3);
  await page.locator('.map-pin').first().click();
  await page.locator('.leaflet-popup').getByRole('button', { name: 'Openen' }).click();
  await expect(page.getByRole('link', { name: 'Route in Google Maps' })).toBeVisible();
  await page.goto('/#/verzameling/restaurant');
  await page.getByRole('button', { name: 'Lijst tonen' }).click();
  await expect(page.getByRole('heading', { name: /Leiden · 3/ })).toBeVisible();
});

test('restaurant verwijderen met de knop onderaan; geen ronde + op restaurantschermen', async ({ page }) => {
  await page.goto('/#/verzameling/restaurant');
  await page.getByRole('button', { name: 'Lijst plakken' }).click();
  await page.getByRole('dialog').getByLabel('Geplakte lijst').fill('Leiden - Stadspark\nLeiden - Pamir');
  await page.getByRole('dialog').getByRole('button', { name: /toevoegen/ }).click();
  await settle(page);
  await expect(addBtn(page)).toHaveCount(0);
  await page.getByRole('button', { name: /Stadspark/ }).click();
  await expect(addBtn(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Restaurant verwijderen' }).click();
  await expect(page.getByText('Naar prullenbak verplaatst')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Restaurants' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Stadspark/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(page.getByRole('button', { name: /Stadspark/ })).toBeVisible();
  await page.goto('/#/verzamelingen');
  await expect(addBtn(page)).toBeVisible();
});
