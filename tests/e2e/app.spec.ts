import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

// Kernstromen uit ROADMAP.md → "Geslaagde eerste versie". Draait op 360 px, 412 px en desktop.

/** De ronde Toevoegen-knop rechtsonder (er is geen navigatiebalk meer). */
const addBtn = (page: Page) => page.getByRole('button', { name: 'Toevoegen', exact: true });

async function loadSamples(page: Page) {
  await page.goto('/#/instellingen');
  await page.getByRole('button', { name: 'Voorbeeldgegevens laden' }).click();
  await expect(page.getByText(/voorbeelditems geladen/)).toBeVisible();
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
  for (const path of ['/verzamelingen', '/verzameling/restaurant', '/verzameling/size', '/verzameling/packing', '/verzameling/todo', '/inbox', '/zoeken?q=gent', '/instellingen', '/prullenbak']) {
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

test('basis-paklijst kopiëren naar een nieuwe reis', async ({ page }) => {
  await loadSamples(page);
  await page.goto('/#/verzameling/packing');
  await page.getByRole('button', { name: /Basislijst weekend weg/ }).click();
  await page.getByRole('button', { name: 'Nieuwe reis van deze basislijst' }).click();
  await expect(page.getByText('Nieuwe paklijst gemaakt van de basislijst')).toBeVisible();
  await expect(page.getByText('0 van 7 afgevinkt')).toBeVisible();
  await expect(page.getByRole('button', { name: /Basislijst weekend weg/ })).toBeVisible(); // koppeling naar de basislijst
});

test('zoeken met een vraag en met filters', async ({ page }) => {
  await loadSamples(page);
  await page.goto('/#/zoeken');
  await page.getByRole('button', { name: 'Welke games staan nog op mijn verlanglijst?' }).click();
  await expect(page.getByText('1 resultaat')).toBeVisible();
  await expect(page.getByRole('button', { name: /Hades II/ })).toBeVisible();
  await page.getByLabel('Zoeken', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Alle soorten' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Boeken' }).click();
  await page.getByRole('radio', { name: 'Gelezen' }).click();
  await expect(page.getByRole('button', { name: /De avond is ongemak/ })).toBeVisible();
  await expect(page.getByText('1 resultaat')).toBeVisible();
});

test('verwijderen, ongedaan maken en terugzetten uit de prullenbak', async ({ page }) => {
  await loadSamples(page);
  await page.goto('/#/verzameling/book');
  await page.getByRole('button', { name: /Project Hail Mary/ }).click();
  await page.getByRole('button', { name: 'Meer acties' }).click();
  await page.getByRole('button', { name: 'Naar prullenbak' }).click();
  await expect(page.getByRole('button', { name: /Project Hail Mary/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Boeken' })).toBeVisible();
  await page.getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(page.getByRole('button', { name: /Project Hail Mary/ })).toBeVisible();

  await page.getByRole('button', { name: /Project Hail Mary/ }).click();
  await page.getByRole('button', { name: 'Meer acties' }).click();
  await page.getByRole('button', { name: 'Naar prullenbak' }).click();
  await expect(page.getByRole('heading', { name: 'Boeken' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Project Hail Mary/ })).toHaveCount(0);
  await page.goto('/#/prullenbak');
  await page.getByRole('button', { name: 'Project Hail Mary terugzetten' }).click();
  await expect(page.getByText('"Project Hail Mary" teruggezet')).toBeVisible();
  await page.goto('/#/verzameling/book');
  await expect(page.getByRole('button', { name: /Project Hail Mary/ })).toBeVisible();
});

test('back-up exporteren en in een lege app terugzetten', async ({ page, browser }, info) => {
  await loadSamples(page);
  await page.goto('/#/instellingen');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Back-up downloaden' }).click()]);
  const file = info.outputPath('backup.json');
  await download.saveAs(file);
  const json = JSON.parse(readFileSync(file, 'utf8'));
  expect(json.format).toBe('bijdehand-backup');
  expect(json.data.items).toHaveLength(28);
  await expect(page.getByText('Laatste back-up: nog nooit')).toHaveCount(0);

  // Schone browser = leeg apparaat.
  const ctx = await browser.newContext({ ...info.project.use });
  const fresh = await ctx.newPage();
  await fresh.goto('/#/instellingen');
  await fresh.getByLabel('Back-upbestand kiezen').setInputFiles(file);
  const dlg = fresh.getByRole('dialog', { name: 'Back-up terugzetten' });
  await expect(dlg.getByText('28 nieuwe items')).toBeVisible();
  await dlg.getByRole('button', { name: 'Samenvoegen' }).last().click();
  await expect(fresh.getByText(/Samengevoegd: 28 nieuw/)).toBeVisible();
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
  await page.getByRole('button', { name: /Boeken/ }).click();
  await addBtn(page).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Boeken' })).toBeVisible();
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
  await page.getByRole('button', { name: 'vegetarisch' }).click();
  await expect(page.getByRole('button', { name: 'vegetarisch verwijderen' })).toBeVisible();
  await settle(page);
  await page.reload();
  await expect(page.getByRole('list', { name: 'Labels' }).getByText('vegetarisch')).toBeVisible();
});

test('Inbox delen met Claude en voorstellen beoordelen en toepassen', async ({ page }, info) => {
  await page.goto('/');
  for (const t of ['Pamir Leiden\nAfghaans, aanrader', 'Lezen\nKlara and the Sun\nProject Hail Mary']) {
    await addBtn(page).click();
    await page.getByRole('dialog').getByLabel('Tekst').fill(t);
    await page.getByRole('dialog').getByRole('button', { name: 'Bewaren' }).click();
    await settle(page);
  }
  await page.goto('/#/inbox');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Delen met Claude' }).click()]);
  const exp = JSON.parse(readFileSync(await download.path(), 'utf8'));
  expect(exp.format).toBe('bijdehand-inbox');
  const id = (t: string) => exp.items.find((i: { titel: string }) => i.titel === t).id;

  // Zo zou Claude antwoorden (zie docs/INDELEN.md).
  const file = info.outputPath('voorstellen.json');
  writeFileSync(file, JSON.stringify({
    format: 'bijdehand-voorstellen', formatVersion: 1, gemaaktOp: new Date().toISOString(), gebaseerdOp: exp.exportedAt,
    voorstellen: [
      { id: 'v1', actie: 'indelen', itemId: id('Pamir Leiden'), type: 'restaurant', titel: 'Pamir', velden: { city: 'Leiden', cuisine: 'Afghaans' }, tekst: 'Aanrader', reden: 'Plaats en keuken herkend' },
      { id: 'v2', actie: 'nieuw', itemId: id('Lezen'), type: 'book', titel: 'Klara and the Sun', velden: { status: 'wil' } },
      { id: 'v3', actie: 'nieuw', itemId: id('Lezen'), type: 'book', titel: 'Project Hail Mary', velden: { status: 'wil', kleur: 'blauw' } },
    ],
  }));
  await page.getByLabel('Voorstellenbestand kiezen').setInputFiles(file);
  const sheet = page.getByRole('dialog', { name: 'Voorstellen van Claude' });
  await expect(sheet.getByText('onbekend veld "kleur"')).toBeVisible();
  await expect(sheet.getByText('was: Pamir Leiden')).toBeVisible();
  await sheet.getByRole('button', { name: '2 toepassen' }).click();
  await expect(page.getByText('1 ingedeeld, 1 nieuw')).toBeVisible();
  await expect(page.getByRole('button', { name: /Lezen/ })).toBeVisible(); // niet volledig gesplitst? wel: 1 van 2 nieuw
  await page.goto('/#/verzameling/restaurant');
  await page.getByRole('button', { name: /Pamir/ }).click();
  await expect(page.getByText('Leiden · Afghaans')).toBeVisible();
  await expect(page.getByText(/Ingevuld door Claude/)).toHaveCount(0); // restaurants: sober detail
  await page.goto('/#/verzameling/book');
  await page.getByRole('button', { name: /Klara and the Sun/ }).click();
  await expect(page.getByText(/Ingevuld door Claude/)).toBeVisible();
  await page.getByRole('button', { name: 'Gecontroleerd' }).click();
  await expect(page.getByText(/Ingevuld door Claude/)).toHaveCount(0);
});

test('restaurant: websiteknop in detail, cijfers en prijsniveau (tijdelijk) niet in beeld', async ({ page }, info) => {
  await page.goto('/#/verzameling/restaurant');
  await page.getByRole('button', { name: 'Lijst plakken' }).click();
  const paste = page.getByRole('dialog', { name: 'Lijst plakken in Restaurants' });
  await paste.getByLabel('Geplakte lijst').fill('Leiden - Pamir (Afghaans)');
  await paste.getByRole('button', { name: /toevoegen/ }).click();
  await settle(page);
  const file = info.outputPath('aanvulling.json');
  writeFileSync(file, JSON.stringify({
    format: 'bijdehand-voorstellen', formatVersion: 1, voorstellen: [
      { id: 'a1', actie: 'aanvullen', type: 'restaurant', zoek: { titel: 'Pamir', city: 'Leiden' }, velden: { website: 'http://pamir.example/', googleRating: 4.7, priceLevel: '€€', summary: 'Afghaans restaurant aan de Breestraat.', venue: 'finedining', michelin: 'Bib Gourmand', experience: true } },
    ],
  }));
  await page.goto('/#/inbox');
  await page.getByLabel('Voorstellenbestand kiezen').setInputFiles(file);
  await page.getByRole('dialog', { name: 'Voorstellen van Claude' }).getByRole('button', { name: '1 toepassen' }).click();
  await settle(page);
  await page.goto('/#/verzameling/restaurant');
  const card = page.getByRole('button', { name: /Pamir/ });
  await expect(card).not.toContainText('Afghaans'); // kaartje: alleen naam en kenmerken (+ eigen cijfer)
  await expect(card).not.toContainText('Wil proberen');
  await expect(card).toContainText('Fine dining'); // alleen fine dining staat als eerste label op het kaartje
  await expect(card.getByRole('img', { name: 'Bib Gourmand' })).toBeVisible();
  await expect(card.getByRole('img', { name: 'Beleving' })).toBeVisible();
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
  // Nagebootste GitHub (Contents API) in het geheugen van de test.
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

  await page.goto('/');
  await addBtn(page).click();
  await page.getByRole('dialog').getByLabel('Tekst').fill('Pamir Leiden');
  await page.getByRole('dialog').getByRole('button', { name: 'Bewaren' }).click();
  await settle(page);

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
  files.set('voorstellen/2026-10-25.json', { sha: 'v1', text: JSON.stringify({
    format: 'bijdehand-voorstellen', formatVersion: 1, gebaseerdOp: stored.exportedAt,
    voorstellen: [{ id: 'v1', actie: 'indelen', itemId: note.id, type: 'restaurant', titel: 'Pamir', velden: { city: 'Leiden', cuisine: 'Afghaans', traits: ['afghaans'] } }],
  }) });
  await page.getByRole('button', { name: 'Nu synchroniseren' }).click();
  await expect(page.getByText(/Claude verwerkte 1 item: Pamir/)).toBeVisible();
  expect(files.has('voorstellen/2026-10-25.json')).toBe(false);
  await page.goto('/#/verzameling/restaurant');
  await expect(page.getByRole('button', { name: /Pamir/ })).toContainText('afghaans');
  await touchTargetsOk(page);
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
