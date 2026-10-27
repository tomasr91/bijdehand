# ARCHITECTURE — Bijdehand

Labels zoals in `PRODUCT.md`. Genomen beslissingen staan in het beslissingslog onderaan;
open beslissingen alleen in `ROADMAP.md`.

## Overzicht — **[Gebouwd]**

Bijdehand is een **local-first Progressive Web App**. Er is geen server: alle gegevens staan in IndexedDB
op het apparaat. De app werkt offline en kan op Android via Chrome worden geïnstalleerd.

| Onderdeel | Keuze |
|---|---|
| Taal / UI | TypeScript, React 19 |
| Build | Vite (statische bestanden in `dist/`, relatieve paden, dus ook te hosten in een submap) |
| Opslag | IndexedDB via Dexie 4 (`src/data/db.ts`); live-queries via `dexie-react-hooks` |
| Iconen | lucide-react |
| Navigatie | Eigen hash-router met echte geschiedenis (`src/ui/router.ts`), zodat de Android-terugknop werkt; open sheets sluiten met "terug" |
| Offline | Eigen service worker (`public/sw.js`): pagina eerst van het netwerk, bestanden eerst uit de cache |
| Tests | Vitest + fake-indexeddb (gegevenslaag), Playwright (e2e op 360 px; lay-out en kaart ook op 412 px en desktop) |

## Lagen

```text
src/screens, src/components   UI — praat alleen met de lagen hieronder
src/ui                        router, contexten (data, meldingen, toevoegen), autosave
src/data/repo.ts              ALLE schrijfacties: transactie, rev, updatedAt, revisie
src/data/search.ts            zoeken + filters (één ingang: search())
src/data/classify.ts          regelgebaseerd voorstel voor een soort
src/data/backup.ts            export, validatie, samenvoegen/vervangen
src/data/db.ts                Dexie-schema (IndexedDB)
```

De UI schrijft nooit rechtstreeks naar de database. Lezen gebeurt via één live-query per tabel
(`DataProvider`); bij duizenden items is dit ruim snel genoeg. Pas paginering of indexen pas toe
bij meetbare traagheid.

## Opslag en betrouwbaarheid — **[Gebouwd]**

- Elke schrijfactie is een Dexie-transactie. Een wijziging en haar revisie worden samen opgeslagen.
- Autosave: de invoer wordt 500 ms na de laatste toetsaanslag opgeslagen. Dat gebeurt ook direct
  bij verlaten van het veld, bij sluiten van het scherm en wanneer de app naar de achtergrond gaat
  (`visibilitychange`/`pagehide`). De opslagindicator toont "Opslaan…", "Opgeslagen" of
  "Niet opgeslagen".
- Bij de eerste opslag vraagt de app om **duurzame opslag** (`navigator.storage.persist()`). Instellingen
  toont of die is toegekend. Zonder toekenning kan de browser bij ruimtegebrek gegevens wissen; daarom
  toont het hoofdscherm "Alleen op dit toestel bewaard" zolang de app niet aan de privé data-repo gekoppeld is (D14, D15).
- Een privévenster of geblokkeerde opslag geeft een foutscherm dat niets wist.

## Synchronisatie — **[Onderzoek]**, besluit B3

**Er is géén synchronisatie.** IndexedDB is per browser en per apparaat. Telefoon en desktop hebben
dus elk hun eigen gegevens. Overzetten kan nu alleen met een back-up (exporteren → herstellen →
samenvoegen). Het model is al voorbereid op sync:

- UUID v7 per record, `rev` en `updatedAt` per record, zacht verwijderen (verwijderingen kunnen meegaan)
  en revisies (een "verliezende" versie blijft bewaard).
- Samenvoegen in `backup.ts` is in feite al een handmatige sync: de nieuwste versie wint en er wordt
  niets verwijderd.

Opties voor B3: (a) een kleine eigen API + database (bijv. SQLite), (b) een gehoste backend
(Supabase/PocketBase), (c) bestandsgebaseerd via een cloudmap (back-upbestand automatisch
wegschrijven en samenvoegen), (d) een CRDT-bibliotheek. Bij (a)/(b) is ook authenticatie nodig
voor één gebruiker. Voorkeur volgt na fase 2.

## Authenticatie

Niet nodig zolang er geen server is. Komt pas met B3.

## Back-up en herstel — **[Gebouwd]**

Het formaat staat in `DATA_MODEL.md`. Exporteren kan als download of, waar Android dat ondersteunt,
via het deelmenu (bijv. naar Google Drive; Web Share met bestanden). Herstellen kan door
samen te voegen (standaard) of door te vervangen (met automatische vangnet-back-up en bevestiging).
Een automatische back-up buiten het apparaat is er nog niet (B4).

## Android-deelmenu (link ontvangen)

- **Gebouwd:** het manifest (`public/manifest.webmanifest`) declareert een `share_target` (GET naar `./`
  met `title`, `text` en `url`). Bij het opstarten leest `readShare()` in `App.tsx` die parameters. De
  URL komt uit `url` of uit `text` (veel Android-apps zetten hem daar). Daarna wordt de query uit de
  adresbalk gehaald en opent de toevoegsheet in link-modus, met de titel ingevuld en `infoVia = deelmenu`.
- **Getest:** het verwerken van deze parameters (e2e-test met dezelfde URL die Android zou openen).
- **Niet getest:** het echte deelmenu. Dat werkt alleen als de app via Chrome op Android is
  **geïnstalleerd** en via **HTTPS** wordt geserveerd. Controleer op het toestel:
  1. de app installeren;
  2. in Chrome of een andere app op Delen tikken en controleren of Bijdehand in de lijst staat;
  3. delen en controleren of de link en titel goed binnenkomen, ook offline (de service worker
     serveert de pagina dan uit de cache).
  Wijkt het gedrag af, overweeg dan POST met een service-worker-handler of een native wrapper (TWA).

## Hosting — **[Gewenst]**, nog niet ingericht

De app is een map met statische bestanden (`npm run build` → `dist/`). Elke HTTPS-host werkt, bijvoorbeeld
GitHub Pages, Netlify of Cloudflare Pages. HTTPS is nodig voor de service worker, installatie en het
deelmenu. Er zijn geen geheimen of omgevingsvariabelen nodig. Let op: de gegevens horen bij het adres
(origin). Een nieuw adres geeft een lege app; zet dan een back-up terug.

## AI en externe bronnen — ontwerp, **[Gewenst]** fase 2

- De app werkt volledig zonder AI. Het huidige voorstel voor een soort komt uit vaste woord- en
  websiteregels (`classify.ts`) en wordt als "vaste regel — geen AI" getoond.
- Haakjes voor later: `Suggestion.by` kan `ai` zijn. `search()` is één ingang waarachter semantisch
  zoeken als extra strategie kan komen. Bronnen hebben aparte velden voor externe informatie met
  `infoVia`, zodat opgehaalde of AI-gegenereerde tekst herkenbaar blijft. Eigen notities worden nooit
  overschreven.
- AI-aanroepen en het ophalen van paginatitels hebben vrijwel zeker een kleine server of proxy nodig
  (vanwege CORS en API-sleutels, die nooit in de app horen). Dat valt samen met B3.

## Claude laat aantekeningen indelen — **[Gebouwd]** (via de privé repo)

Claude schrijft nooit rechtstreeks in de gegevens: alleen voorstellen, die de app controleert en toepast. Werkwijze en formaten
staan in `INDELEN.md`; code in `src/data/claude.ts` (controleren, toepassen, ongedaan maken) en `src/data/sync.ts`.

- De app synchroniseert met de **privé** repo `bijdehand-data` (D13, D14); een geplande Claude-taak (dagelijks en op verzoek)
  leest `data/bijdehand.json`, zet voorstellen in `voorstellen/`, en de app past ze automatisch toe, met *Ongedaan maken*.
  Toepassen loopt via de gewone schrijfacties, dus met revisies. Werkwijze van de taak: `INDELEN.md` → Dagelijkse taak;
  hulpscript `scripts/claude-taak.ts`.
- De vroegere handmatige route (Inbox delen als bestand, voorstellenbestand openen) en de proefversie als artifact zijn
  verwijderd (D20).

## Kaart en adressen — **[Gebouwd]** (D16)

- **Kaart:** Restaurants → kaarticoon in de kopbalk wisselt tussen lijst en kaart (keuze per toestel onthouden).
  Leaflet met OpenStreetMap-tegels (`src/screens/RestaurantMap.tsx`). Gevuld punt met cijfer = geweest, open rondje = nog niet.
  Tik → naam, labels, cijfer en *Openen*. *Waar ben ik* vraagt pas bij tikken om de locatie. Filters gelden ook voor de kaart.
- **Locaties (D17):** `src/data/geocode.ts` zet het adres om, eerst via **PDOK Locatieserver** (Nederlandse overheid, nauwkeurig
  voor Nederlandse adressen; alleen treffers op adres/postcode/straat), anders via OpenStreetMap Nominatim (max. 1 per seconde).
  Alleen restaurants mét adres (een plaatsnaam alleen zou misleidend midden in de stad landen). Gebeurt standaard op de
  achtergrond bij openen van en terugkomen in de app, en als de kaart opent; mislukt verzoek één keer opnieuw na 3 s.
  Opgeslagen als verborgen velden `lat`, `lng` en `geoFor` (het adres waarvoor gezocht is). Verandert het adres, dan zoekt de
  app opnieuw; zo corrigeer je een verkeerd punt. Niet gevonden = `geoFor` zonder punt, verschijnt onder "zonder locatie".
- **Privacy:** restaurantadressen gaan naar PDOK en eventueel OpenStreetMap; OSM ziet welk kaartgebied je bekijkt. Geen persoonsgegevens.
- **Adres standaard (D17):** de dagelijkse Claude-taak vult altijd een adres in de vorm *Straat nr, postcode Plaats*, en krijgt via
  `claude-taak.ts todo` → `adresNodig` de restaurants waarvan de app het adres niet vond (of zonder adres) om te verbeteren.
- **Offline:** geen kaart zonder internet (tegels worden niet bewaard); de lijst werkt gewoon.

## Google Keep-import — **[Onderzoek]** fase 2

Voorlopige aanpak, te verifiëren met een echte Takeout-export van de eigenaar:

- Google Takeout levert voor Keep per notitie een bestand (JSON en HTML). Dit bevat naar verwachting
  de titel, de tekst of lijstregels met afvinkstatus, labels, kleur, pin/archief/prullenbak-status en
  tijdstempels. De exacte velden staan nog niet vast.
- Import gebeurt in de app (bestand of zip kiezen). Lijsten worden checklists, labels worden tags,
  links worden bronnen en de originele tekst blijft volledig bewaard. Als `origin` geldt
  `{ system: 'google-keep', ref: <bestandsnaam> }`; daardoor wordt een tweede import herkend en niet
  dubbel uitgevoerd.
- Indelen gaat via het regelgebaseerde voorstel. Bij twijfel komt een item in de Inbox.
- Vóór het importeren volgt een voorbeeldoverzicht met aantallen en daarna een verplichte back-up.
  De app raakt Google Keep zelf nooit aan (alleen lezen uit het exportbestand).

## Beveiliging en privacy

Er zijn geen accounts, geen tracking en geen externe verzoeken, behalve wanneer je zelf een link
opent of een afbeeldings-URL invult. De afbeelding wordt dan geladen met `no-referrer`. De app
bevat geen geheimen.

## Beslissingslog

- **D01 — 2026-10-24 — Local-first PWA met TypeScript, React, Vite en Dexie.** Reden: één codebase voor Android
  en desktop, offline, geen server of beheer nodig in fase 1, installeerbaar. Gevolgen: sync en meldingen
  hebben later extra infrastructuur nodig; lokale opslag vraagt om een back-updiscipline (waarschuwing ingebouwd).
- **D02 — 2026-10-24 — De tien soorten zijn die van de eigenaar** (cadeaus t/m plantenonderhoud) in de groepen
  Inspiratie, Praktisch en Naslag. Vervangt het eerdere voorstel.
- **D03 — 2026-10-24 — (vervangen door D15)** Navigatie met vijf vaste bestemmingen onderaan: Vandaag, Verzamelingen, Toevoegen,
  Bronnen, Zoeken. De Inbox is bereikbaar via Vandaag en Verzamelingen. Op ≥ 900 px wordt de balk een rail links.
- **D04 — 2026-10-24 — Links zijn altijd een `Source`** (één keer bewaard, gekoppeld), nooit een los tekstveld.
  Een link zonder soort komt alleen in Bronnen; tekst zonder soort komt in de Inbox.
- **D05 — 2026-10-24 — Indelingsvoorstel via vaste regels, geen AI** in fase 1; altijd bevestigen door de gebruiker.
- **D07 — 2026-10-24 — Restaurants per plaats, met keuken en kenmerken als lijst** (schema v2, migratie `location` → `city`). Kenmerken zijn een eigen lijstveld en geen algemene tags, zodat filteren per soort zinvol blijft.
- **D08 — 2026-10-24 — Lijst plakken als eerste importroute.** Werkt per verzameling, bewaart de oorspronkelijke regel en is ook de basis voor de latere Keep-import.
- **D20 — 2026-10-25 — Opgeruimd wat niet meer gebruikt wordt.** Weg: handmatig *Delen met Claude* / *Voorstellen openen*
  (vervangen door de sync, D14), voorbeeldgegevens in Instellingen, de proefversie als artifact (`build:artifact`, `seed.ts`,
  `VITE_PREVIEW`). Testgegevens staan nu in `src/data/testdata.ts` en worden in e2e als back-up teruggezet. Lege soorten
  staan niet meer op het hoofdscherm en bij *Soort kiezen* ingeklapt onder *Andere soorten*; (sinds D25 zijn de ongebruikte soorten helemaal weg). E2e draait volledig op 360 px, op 412 px en desktop alleen lay-out en kaart.
- **D27 — 2026-10-27 — Congressen.** Nieuwe soort `conference` in de groep Praktisch, op het generieke verzamelingsscherm
  (`GenericCollection`) met groepering per maand (`groupByMonth`) en afgelopen congressen onder *Geweest*. Status handmatig
  (niet afgeleid). Geen kaart, cijfer of hartje [Aanname]. Schema blijft v5.
- **D26 — 2026-10-27 — Uitjes met kinderen en dates als plek-soorten.** Twee nieuwe soorten (`activity`, `date`) met dezelfde
  weergave als restaurants: `TypeDef.place` + `placeTexts` in het register, gedeelde schermen `Places.tsx` (lijst, filters, kaart),
  `PlaceMap.tsx` en `PlaceDetail.tsx` (hernoemd uit de restaurantschermen, werken per soort). Kaartpunten (`geocode.ts`), geen ronde +,
  lijst plakken en het opzoeken door de dagelijkse taak werken voor alle plek-soorten. Geen schemawijziging (v5): alleen nieuwe
  `type`-waarden. Inbox-items worden dagelijks door Claude ingedeeld (`INDELEN.md`).
- **D25 — 2026-10-25 — Alleen restaurants, albums en de paklijst; één lijn in de opmaak.** De zeven ongebruikte soorten zijn uit
  de code. Schema v5: oude items van die soorten gaan naar de Inbox met alle velden bewaard en een *Was: …*-regel in de notities
  (ook bij terugzetten van een back-up). Alle hoofdschermen krijgen de merkkop en losse kaarten; de paklijst een plakkende
  voortgangsbalk. Een soort komt terug als de eigenaar hem wil (definitie in `itemTypes.ts` + `TypeKey`).
- **D24 — 2026-10-25 — Merkkop en losse kaarten (naar Uit in 030).** Donkere terracotta kop met lijntekening op het hoofdscherm
  en bij Restaurants; plakkend filterblok met aantallen; restaurants als losse kaarten (labels gewoon onder de naam; het etiket bovenaan is op verzoek weer weg); plaatskoppen
  in de merkkleur. Eigen kleur behouden, geen extra iconen.
- **D23 — 2026-10-25 — Eén paklijst.** De tegel opent de lijst direct; Toevoegen en voorstellen (`aanvullen` met `checklist`)
  vullen de bestaande lijst aan, zonder dubbele punten. Zijn er toch meer, dan geldt de oudste.
- **D22 — 2026-10-25 — Paklijst is alleen een checklist.** Basislijst/reis (kopiëren, vertrekdatum) is weg; de velden blijven
  verborgen bewaard. *Alles uitvinken* bovenaan de checklist (met *Ongedaan maken*). Geplakte tekst met meerdere regels wordt in
  een invoerveld per regel een punt (een gewoon invoerveld voegde de regels samen tot één lange titel).
- **D21 — 2026-10-25 — Geen symbolen meer bij restaurants; rijkere labels.** ⭐/🌱/🎭 naast de naam zijn weg. Labels hebben een vaste
  volgorde (plek, keuken, volledig vega/vegan, onderscheiding, hoe je eet, beleving, rest; `INDELEN.md`); het kaartje toont de
  eerste drie. *À la carte*, terras en dergelijke worden geen label. `michelin` en `experience` blijven bewaard.
- **D19 — 2026-10-24 (bijgewerkt 2026-10-25) — Soort zaak en symbolen.** Restaurantveld `venue` (fine dining / restaurant / bistro / casual) en `experience`
  (🎭); ⭐/🌱 afgeleid. Op verzoek van de eigenaar toont de app alleen fine dining, als gewoon label "Fine dining" vóór de andere labels (geen ruiten,
  geen vorm per soort op de kaart); de andere waarden blijven bewaard. Claude vult `venue` standaard in. Voorstellen met velden of
  acties die de app nog niet kent, blijven in de repo staan tot de app is bijgewerkt; de back-up vermeldt `appVersion`.
  `aanvullen` kan ook met `itemId`.
- **D18 — 2026-10-24 — Geen dubbele items meer.** (1) Synchroniseren via een Web Lock: maar één tabblad tegelijk.
  (2) Toegepaste voorstelbestanden worden onthouden (naam@sha) en nooit opnieuw toegepast. (3) Voorstellen `nieuw`/`indelen`
  voor iets dat er al staat (soort + naam + plaats) of dubbel in het bestand: niet toepassen. (4) Bij openen ruimt
  `src/data/repair.ts` overduidelijke kopieën op (door Claude, zelfde aantekening, < 5 s, gelijke inhoud). Nieuwe actie
  `verwijderen` (alleen met itemId, naar de prullenbak).
- **D17 — 2026-10-24 — Locaties eerst via PDOK, op de achtergrond, en adres verplicht bij Claude.** Op de telefoon stopte
  het opzoeken via OpenStreetMap na een paar adressen (OSM blokkeert browserverzoeken soms). Zie Kaart en adressen.
- **D16 — 2026-10-24 — Kaart met restaurants (lost B12 op).** Leaflet + OpenStreetMap-tegels; locaties via Nominatim in de
  app, automatisch bij openen van de kaart (zonder bevestiging per adres; correctie via het adres). Zie Kaart en adressen.
- **D15 — 2026-10-24 — Eén hoofdscherm, geen navigatiebalk.** Alleen Verzamelingen, Instellingen en een ronde
  Toevoegen-knop. Vandaag en de lijst Bronnen zijn weg (code verwijderd; gegevens blijven). Links zonder soort worden een
  Inbox-item met de link (niet meer een losse bron). Zoeken blijft als vergrootglas binnen een verzameling.
- **D14 — 2026-10-24 — Synchronisatie met de privé data-repo** (`src/data/sync.ts`, `src/ui/sync.tsx`, Instellingen →
  Synchronisatie). GitHub Contents API rechtstreeks vanuit de app met een fine-grained token (alleen *Contents: Read and write*
  op de data-repo), opgeslagen in de lokale meta-tabel, nooit in back-ups. De app weigert een openbare repo. Het toestel is de
  enige schrijver van `data/bijdehand.json` (volledige back-up); alleen bij de eerste koppeling wordt wat er al staat samengevoegd
  (nieuwste wint, niets weg). Claude schrijft alleen `voorstellen/*.json`; de app past de "ok"-voorstellen automatisch toe,
  verwijdert het bestand en toont *Ongedaan maken*. Synchroniseren: bij openen, bij terugkomen in de app, elke minuut na een
  wijziging en bij wegschakelen. **Beperking:** twee toestellen tegelijk worden nog niet samengevoegd (B3), en definitief
  verwijderde items kunnen op een ander toestel blijven bestaan.
- **D13 — 2026-10-24 — Hosting en route 2 (lost B10 en B13 op).** Code in de **openbare** repo `tomasr91/bijdehand`, gepubliceerd met
  GitHub Pages (gratis alleen vanuit een openbare repo). Gegevens in de **privé** repo `tomasr91/bijdehand-data`, nooit in de
  code-repo; testvoorbeelden gebruiken verzonnen namen. Later privé + Cloudflare Pages kan: nieuw adres, gegevens komen dan
  via de data-repo of een back-up mee. De gepubliceerde app zelf is altijd openbaar en bevat geen gegevens.
- **D12 — 2026-10-24 — Startpagina is Verzamelingen** (eerst in de navigatie, `HOME` in `src/ui/router.ts`, `start_url` in het manifest).
- **D11 — 2026-10-24 — Restaurants: geen status meer, maar cijfer + hartje** (schema v4). "Geweest" volgt uit het cijfer; lijst en detail zijn eigen schermen met het belangrijkste bovenaan.
- **D10 — 2026-10-24 — Restaurants: eigen cijfer 1–10 en sober detail.** Sterren (1–5) worden `score` (schema v3, × 2). Het detail toont alleen hoofdvelden en notities; geschiedenis, links en tags zijn er niet zichtbaar (gegevens blijven bewaard, terugzetten kan via een back-up).
- **D09 — 2026-10-24 — Claude deelt in via voorstellen, nooit rechtstreeks.** Route 1 nu (bestanden delen), route 2 later (privé-repo). Code en gegevens blijven gescheiden; gegevens nooit in de code-repo.
- **D06 — 2026-10-24 — Notitietekst is platte tekst** (lost het oude B6 op); opmaak alleen als daar later reden voor is.
