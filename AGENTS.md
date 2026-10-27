# AGENTS.md — Bijdehand

Algemene ontwikkelregels voor iedere AI-ontwikkeltool (en mens) die aan dit project werkt.
Dit bestand is de **bron van waarheid** voor werkwijze en regels. Tool-specifieke aanvullingen
staan in eigen bestanden (bijv. `CLAUDE.md`) en mogen deze regels niet tegenspreken.

## Wat is dit project?

Bijdehand (werknaam) is een persoonlijke, mobile-first app die Google Keep vervangt: een
persoonlijk geheugen met zeven soorten informatie (restaurants, uitjes met kinderen, dates, congressen, kleding, albums en één paklijst), bronnen en een Inbox.
Nieuwe soorten komen erbij als de eigenaar ze wil (D25). Eén gebruiker. Primair
Android, desktop aanvullend.

## Huidige status

- **Fase 1 (werkende basis) is gebouwd en geautomatiseerd getest.** De handmatige controle op het eigen
  Android-toestel staat nog open. De volgende stap staat in `docs/ROADMAP.md`.
- Stack: local-first PWA met TypeScript, React, Vite en Dexie (IndexedDB). Er is geen server; de app synchroniseert optioneel met een privé GitHub-repo (`src/data/sync.ts`, `docs/ARCHITECTURE.md` D14).
- Publicatie: GitHub Pages vanuit deze **openbare** repo (`.github/workflows/pages.yml`). Zet hier nooit persoonlijke gegevens
  in, ook niet in tests of docs: gebruik verzonnen namen. Gegevens horen in de privé repo `bijdehand-data`.

## Snel aan de slag

```bash
npm install
npm run dev          # ontwikkelserver
npm test             # unit-/integratietests gegevenslaag (Vitest)
npm run build        # productiebuild naar dist/
npm run test:e2e     # Playwright: alles op 360 px; lay-out en kaart ook op 412 px en desktop (gebruikt de build)
npm run check        # alles: unit, build (met typecheck), e2e
```

Code: `src/data/` (model, opslag, zoeken, back-up — geen UI), `src/ui/` (router, contexten, autosave),
`src/components/` (herbruikbaar), `src/screens/` (schermen), `public/` (manifest, service worker, iconen),
`tests/e2e/`.

Werk deze sectie bij zodra de status verandert.

## Documentatiekaart

| Bestand | Beantwoordt |
|---|---|
| `docs/PRODUCT.md` | Waarom en wat: visie, behoefte, functies, de informatiesoorten, wat het níet is |
| `docs/DATA_MODEL.md` | Welke gegevens: entiteiten, itemtypen, velden, relaties, metadata, historie |
| `docs/ARCHITECTURE.md` | Hoe technisch: opslag, sync, auth, back-ups, integraties, beslissingslog |
| `docs/DESIGN.md` | Hoe het eruitziet en voelt: stijl, navigatie, aanraakvlakken, componenten |
| `docs/INDELEN.md` | Hoe Claude aantekeningen indeelt: notatie per soort, regels, voorstellenbestand |
| `docs/GOOGLE_PLACES.md` | Google-sleutel aanmaken voor restaurantgegevens (Places API) |
| `docs/ROADMAP.md` | Wanneer en in welke volgorde: fasen, afrondcriteria, tests, **open beslissingen** |

Lees bij het begin van een sessie minimaal deze file en `docs/ROADMAP.md`; lees de overige
documenten die raken aan je taak.

## Statuslabels in documentatie

Gebruik in alle docs deze labels, zodat gewenst en werkelijk niet door elkaar lopen:

- **[Gebouwd]** — bestaat in de code en is getest.
- **[Gewenst]** — besloten functionaliteit of eis, nog niet gebouwd.
- **[Onderzoek]** — mogelijkheid of vraag die eerst uitgezocht moet worden.
- **[Aanname]** — werkhypothese zonder bevestiging van de eigenaar.

Open beslissingen hebben een ID (`B1`, `B2`, …) en staan **alleen** in `docs/ROADMAP.md`;
andere documenten verwijzen naar die ID in plaats van de beslissing te herhalen.

## Ontwikkelregels

1. **Mobile-first is een harde eis.** Ontwerp, bouw en test eerst op een smal mobiel scherm
   (referentie: 360–412 px breed, touch). Desktop is een uitbreiding, geen startpunt.
2. **Android eerst, desktop aanvullend.** De app moet op Android prettig werken (geïnstalleerde PWA in
   Chrome). Desktop mag nooit ten koste gaan van de mobiele ervaring.
3. **Eerst onderzoeken, dan wijzigen.** Lees bestaande code, tests en docs voordat je iets
   aanpast. Ga niet uit van een technologie die niet in de repo of in een genomen beslissing staat.
4. **Klein en controleerbaar.** Werk in kleine stappen met één doel per wijziging. Elke stap laat
   het project in werkende staat achter. Beschrijf wat je veranderde en hoe je het controleerde.
5. **Gebruikersgegevens zijn heilig.**
   - Nooit gegevens hard verwijderen zonder prullenbak of expliciete bevestiging.
   - Schemawijzigingen altijd via een geteste, voorwaartse migratie; nooit stilzwijgend velden laten vallen.
   - Export moet verliesvrij zijn (export → import levert dezelfde gegevens op).
   - Bij twijfel over dataverlies: stoppen en melden, niet gokken.
6. **Geen schijnfunctionaliteit.** Bouw geen knoppen of schermen die alleen visueel werken. Is iets
   onvolledig, maak dat zichtbaar in de UI (of laat het weg) en noteer de beperking in de docs.
7. **Testen hoort bij de wijziging.** Voer relevante tests uit (minimaal de mobiele viewport), los
   gevonden fouten op en voeg een test toe voor elke opgeloste bug. Zie de teststrategie in `docs/ROADMAP.md`.
   Alle schrijfacties lopen via `src/data/repo.ts` (of `backup.ts`); de UI schrijft nooit rechtstreeks naar de database.
8. **Documentatie meeschrijven.** Verandert een belangrijke keuze of functie, werk dan in dezelfde
   wijziging de betreffende doc, de statuslabels en `docs/ROADMAP.md` bij. Een genomen beslissing
   gaat naar het beslissingslog in `docs/ARCHITECTURE.md` en verdwijnt uit de open lijst.
9. **Zo eenvoudig mogelijk.** Kies de eenvoudigste oplossing die werkt. Voeg geen lagen, libraries of
   abstracties toe "voor later", maar maak toekomstige uitbreiding (sync, desktop, nieuwe itemtypen)
   ook niet onnodig moeilijk.
10. **Geen geheimen in de code.** Geen echte API-sleutels, tokens of wachtwoorden in broncode, tests,
    docs of commits. Gebruik omgevingsvariabelen en lever alleen voorbeeldbestanden (`.env.example`).

## Klaar-criteria voor een wijziging

- [ ] Werkt en is getest op mobiele viewport; desktop breekt niet.
- [ ] Geen risico op dataverlies, of het risico is opgelost met migratie/test.
- [ ] `npm run check` is groen.
- [ ] Docs en statuslabels kloppen met de werkelijke situatie.
- [ ] Geen geheimen toegevoegd.

## Taal

Documentatie en UI-teksten in het Nederlands. Code (namen, commentaar) in het Engels, tenzij anders besloten.
