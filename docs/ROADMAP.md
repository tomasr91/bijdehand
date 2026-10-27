# ROADMAP — Bijdehand

Laatst bijgewerkt: 2026-10-24 · **Huidige fase: 1 (werkende basis) — gebouwd en geautomatiseerd getest;
handmatige controle op het eigen Android-toestel staat nog open.**

## Volgende stap

1. **Publiceren via GitHub Pages** (besluit D13; workflow `.github/workflows/pages.yml`) en de app installeren op de eigen
   Android-telefoon: <https://tomasr91.github.io/bijdehand/>.
2. **Koppelen op de telefoon** (Instellingen → Synchronisatie, sleutel maken) en de dagelijkse Claude-taak controleren
   (D14; werkwijze in INDELEN.md → Dagelijkse taak).
3. **Handmatige toestelcontrole** uitvoeren (checklist hieronder), inclusief het echte deelmenu.
4. Daarna fase 2 verder met de **Google Keep-import**. Daarvoor is een echte Takeout-export van de
   eigenaar nodig.

## Fasen

| Fase | Doel | Status |
|---|---|---|
| 0 | Projectcontext en documentatie | Afgerond |
| 1 | Werkende basis | Gebouwd; toestelcontrole open |
| 2 | Migratie en slimme functies | Niet gestart |
| 3 | Actieve assistent | Niet gestart (onderzoek) |

### Fase 1 — Werkende basis

Gebouwd: mobiele interface; vijf hoofdschermen plus Inbox, Instellingen en Prullenbak; alle tien
soorten met eigen velden en weergave; aanmaken, bekijken, wijzigen (autosave) en verwijderen
(prullenbak, ongedaan maken); zoeken en filters; duurzame lokale opslag; export en herstel;
koppelingen; eerdere versies; duplicaatherkenning; basis-paklijsten; regelgebaseerd voorstel;
voorbeeldgegevens; installeerbaar en offline; ontvangst via het deelmenu (code).

**Afgerond als** de eigenaar op de eigen Android-telefoon:

- [x] snel een nieuw item kan toevoegen — *e2e getest*
- [x] de soorten overzichtelijk kan beheren — *e2e getest* (sinds D26: restaurants, uitjes, dates, albums, paklijst)
- [x] een item eenvoudig kan terugvinden — *e2e getest*
- [x] een checklist kan afvinken — *e2e getest*
- [x] een bestaand item kan wijzigen — *e2e getest*
- [x] gegevens na heropenen terugvindt — *e2e getest (herladen)*
- [x] een back-up kan exporteren en herstellen — *e2e getest (lege browser)*
- [x] prettig bedient zonder horizontaal scrollen of lange formulieren — *e2e controleert scrollen en 44 px*
- [ ] **alles hierboven ook op het echte toestel heeft gedaan** (checklist hieronder)

### Fase 2 — Migratie en slimme functies

| Onderdeel | Afhankelijk van | Afgerond als |
|---|---|---|
| Google Keep-import (Takeout) | Echte export van de eigenaar | Volledige export importeert zonder fouten; aantallen kloppen in het rapport; checklists blijven checklists; datums en links bewaard; tweede import maakt geen dubbelen; onzekere items in de Inbox; back-up vóór import verplicht; steekproef van 20 handmatig vergeleken |
| Samenvatting per restaurant (3–5 zinnen) bovenaan het detail — **gebouwd voor de huidige 15**; nieuwe restaurants via de aanvultaak | Aanvultaak | Samenvatting in eigen woorden van Claude, op basis van feiten uit de bronnen (geen reviewcitaten); gemarkeerd als "door Claude geschreven" met datum; aan te passen of te verwijderen |
| Geplande taak: nieuwe restaurants aanvullen via Google Places API (zie `GOOGLE_PLACES.md`) | Privé-repo, Google-sleutel | Nieuw restaurant krijgt binnen een dag cijfer, aantal, prijsniveau, adres, website, kenmerkende labels, samenvatting en links; maandelijkse verversing; sleutel alleen als geheim |
| Opgezochte cijfers en prijsniveau weer tonen. **Nu op verzoek van de eigenaar verborgen** (`hidden` in het register); de waarden blijven bewaard. Het kaartje toont nu alleen naam, kenmerken en je eigen cijfer | Besluit eigenaar (waar: kaartje of detail?) | `hidden` weghalen; weergave opnieuw bouwen (de oude ★ · € · keuken-regel staat in de git-geschiedenis); samenvattingen bevatten zelf geen cijfers of prijzen |
| Kaart met restaurants — **gebouwd** (D16) | — | Gedaan: locaties via OpenStreetMap, kaart op 360 px getest, correctie via adres, lijst werkt offline. Open: controle op het eigen toestel |
| Claude-route 2: voorstellen ophalen uit privé-repo — **gebouwd** (D14) | — | Gedaan: automatisch synchroniseren, voorstellen automatisch toepassen met *Ongedaan maken*; token alleen op het toestel; de handmatige route is verwijderd (D20). Open: controle op het eigen toestel |
| Verbanden voorstellen | — | Voorstellen zijn herkenbaar en worden nooit automatisch gekoppeld |
| Verbeterd zoeken | — | Zoeken op synoniemen/meervoud en op datum; voorbeeldvragen blijven werken |
| Automatische classificatie, samenvattingen, bronverrijking (AI) | B3, B11 | Werkt via een server of proxy zonder sleutels in de app; AI-tekst gemarkeerd; app blijft zonder AI bruikbaar |

### Fase 3 — Actieve assistent (onderzoek)

Herinneringen met meldingen (vereist push-server of native wrapper), terugkerende taken, updates van
geselecteerde bronnen, slimme suggesties en verdere integraties. Per onderdeel eerst een voorstel
met beperkingen.

## Handmatige toestelcontrole (Android)

1. Openen via de HTTPS-url in Chrome → menu → *App installeren* → openen vanaf het startscherm.
2. Instellingen: staat er "Duurzame opslag is toegekend"?
3. Tekst, link en checklist bewaren; met één hand bedienen; toetsenborden passen bij het veld.
4. Terugknop: sluit eerst de sheet en gaat dan één scherm terug.
5. Vliegtuigmodus aan → app openen en iets bewaren → werkt het?
6. Vanuit Chrome een pagina **delen** → staat Bijdehand in het deelmenu, en komt de link goed binnen?
7. Back-up delen naar Drive (of downloaden) en op een computer terugzetten.

Leg de uitkomst vast in deze sectie, en bij het deelmenu ook in `ARCHITECTURE.md`.

## Teststrategie

| Niveau | Wat | Bestand | Commando |
|---|---|---|---|
| Unit/integratie | Claude-voorstellen (controle, toepassen, splitsen, ongedaan maken, sync), lijst plakken (met een realistische (verzonnen) restaurantlijst), schemamigratie v1→v2, URL-normalisatie, datums, classificatie, repository (revisies, prullenbak, duplicaten, planten), zoeken op voorbeeldvragen, back-up-roundtrip, samenvoegen, ongeldige bestanden | `src/data/*.test.ts` | `npm test` |
| End-to-end | Kernstromen op **360 px**; lay-out (geen horizontaal scrollen, geen aanraakvlak onder 44 px) en kaart ook op **412 px en 1280 px**. Testgegevens: `src/data/testdata.ts` (verzonnen), teruggezet als back-up | `tests/e2e/app.spec.ts` | `npm run test:e2e` |
| Alles | Typecheck + unit + build + e2e | — | `npm run check` |
| Handmatig | Toestelcontrole hierboven | — | Bij elke fase-afronding |

Regels: een opgeloste bug krijgt een test. Een schemawijziging vraagt een test met een back-up uit
de vorige versie. Alle tests zijn groen voordat een fase afgerond heet.

## Open beslissingen

| ID | Vraag | Nodig vóór | Huidige aanname |
|---|---|---|---|
| B3 | Sync telefoon ↔ desktop: welke aanpak en hosting, welke login? | Desktopgebruik met dezelfde gegevens | Geen sync; overzetten via back-up |
| B4 | Automatische back-up: waarheen? | Fase 2 | Handmatig + waarschuwing na 14 dagen |
| B5 | Meldingen: push-server of native wrapper acceptabel? | Fase 3 | Geen meldingen (Vandaag is weg, D15) |
| B7 | Bijlagen en afbeeldingen opslaan: wanneer, en met welke limiet? | Afbeeldingsinvoer / Keep-afbeeldingen | Niet; alleen afbeeldings-URL bij bronnen |
| B8 | Keep-import: ook gearchiveerde notities en de prullenbak? | Keep-import | Gearchiveerd ja (met tag), prullenbak nee |
| B9 | Is "Bijdehand" de definitieve naam? | Publiceren | Werknaam |
| B11 | AI: welke dienst, welke kosten, wat mag de app versturen? | AI-functies fase 2 | Geen AI |

Genomen besluiten (o.a. de vroegere B1, B2 en B6): zie het beslissingslog in `ARCHITECTURE.md` (D01–D09).
