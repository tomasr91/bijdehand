# DATA_MODEL — Bijdehand

Status: **[Gebouwd]**, schemaversie 4. De code is de bron: `src/data/model.ts` (typen),
`src/data/itemTypes.ts` (soorten en velden) en `src/data/db.ts` (opslagschema).
Werk dit document bij in dezelfde wijziging als die bestanden.

## Uitgangspunten

- **Eén centrale entiteit `Item`** met `type` en typespecifieke velden in `fields`. Er is geen tabel
  per soort; zoeken, export en nieuwe soorten blijven daardoor eenvoudig. Toch belandt niet alles in één
  tekstveld: elke soort heeft benoemde velden met een eigen invoer.
- **Bronnen zijn een eigen entiteit** (`Source`). Een link wordt één keer bewaard en aan items gekoppeld.
- **ID's** zijn UUID v7 (tijd-sorteerbaar). Ze worden offline aangemaakt en botsen niet bij latere sync.
- **Tijden:** tijdstippen in UTC (ISO 8601); datums zonder tijd als `YYYY-MM-DD` in lokale tijd.
- **Zacht verwijderen:** `deletedAt` vullen. Definitief verwijderen alleen vanuit de prullenbak, na bevestiging.
- **Elke wijziging:** `rev + 1`, `updatedAt`, en een revisie met de vorige versie.

## Entiteiten

### Item

| Veld | Type | Toelichting |
|---|---|---|
| `id` | string | UUID v7 |
| `type` | `TypeKey \| null` | `null` = nog niet ingedeeld (Inbox) |
| `title` | string | Bij tekstinvoer de eerste regel |
| `body` | string | "Mijn notities" (vrije tekst) |
| `fields` | object | Typespecifieke velden (tabel hieronder) |
| `checklist` | `{ id, text, done }[]` | Voor elke soort beschikbaar; standaard bij Paklijsten |
| `tags` | string[] | Kleine letters, zonder `#` |
| `createdAt`, `updatedAt` | ISO-tijd | |
| `deletedAt` | ISO-tijd \| null | In prullenbak |
| `rev` | number | Begint bij 1 |
| `origin` | `{ system, ref?, at }` \| null | `sample`, `backup`, `share`, `google-keep`, `paste` of `claude` (bij `paste`/`claude` is `ref` de oorspronkelijke regel/aantekening) |
| `filledBy` | `{ by: 'claude', at, fields[] }` (optioneel) | Welke onderdelen Claude invulde via een voorstel; verdwijnt bij "Gecontroleerd" |
| `suggestion` | `{ type, reason, by }` \| null | Voorstel voor een soort; `by` = `regels` (nu) of `ai` (later). Verdwijnt bij indelen |
| `schemaVersion` | number | 4 |

### Typespecifieke velden

| Soort (`type`) | Velden in `fields` |
|---|---|
| Restaurants (`restaurant`) | `city` (plaats), `cuisine` (keuken), `traits` (labels, lijst), `score` (eigen cijfer 1–10, één decimaal), `favorite` (ja/nee), `venue` (soort zaak: finedining/restaurant/bistro/casual), `experience` (ja/nee, beleving), `visited` (verborgen; "geweest" zonder cijfer uit v3). **Geen statusveld:** de status "geweest" wordt afgeleid (`derivedStatus`: cijfer of `visited`), `address` (adres of buurt, voor de kaart), `dishes`. **Opgezocht** (`external`): `summary` (samenvatting), `website` (link), `priceLevel` €–€€€€, `googleRating`/`googleCount`, `theforkRating`/`theforkCount`, `tripadvisorRating`/`tripadvisorCount`, `michelin`, `openStatus`, `checkedAt`, `ratingSource`, `uncertain`; verborgen locatie `lat`, `lng`, `geoFor` (door de app opgezocht uit het adres, D16) |
| Uitjes met kinderen (`activity`) en Dates (`date`) (D26) | Zelfde basis als restaurants, zonder `cuisine`, `venue`, `experience`, `dishes` en prijzen/cijfers van buiten: `city`, `traits` (labels), `score`, `favorite`, `visited` (verborgen), `address`; opgezocht (`external`): `summary`, `website`, `openStatus`, `checkedAt`, `uncertain`; verborgen locatie `lat`, `lng`, `geoFor`. Status "geweest" afgeleid van het cijfer, net als bij restaurants. Geen schemawijziging: nieuwe `type`-waarden, schema blijft v5 |
| Congressen (`conference`) (D27) | `startDate`, `endDate` (JJJJ-MM-DD; einddatum leeg bij één dag), `city` (of "Online"), `status`: interessant/gaat/geweest, `website`, `traits` (labels). Opgezocht (`external`): `summary`, `checkedAt`, `uncertain`. Geen cijfer, hartje of kaartpunt. Schema blijft v5 |
| Albums (`album`) | `artist`, `status`: ontdekken/luisteren/opnieuw/geluisterd, `rating` |
| Paklijsten (`packing`) | alleen `checklist` (D22); oude velden `isTemplate`, `tripDate` verborgen bewaard |

Veldwaarden zijn tekst, getal, ja/nee, `null` of een lijst met teksten (`kind: 'list'`, bijv. kenmerken).
Een `url`-veld (`kind: 'url'`, bijv. `website`) is tekst die met `http://` of `https://` begint.
Een `score`-veld (`kind: 'score'`) is een getal van 1 t/m 10, afgerond op één decimaal (invoer met komma of punt).
Een veld met `hidden: true` in het register wordt nergens getoond, maar de waarde blijft bewaard en gaat mee in back-ups
(nu: de cijfers, aantallen, `priceLevel` en `ratingSource` bij restaurants, zie `ROADMAP.md`, en de locatie `lat`/`lng`/`geoFor`).
Links horen niet in deze velden: ze zijn altijd een gekoppelde `Source`.

### Source (bron)

| Veld | Toelichting |
|---|---|
| `id`, `createdAt` (= opgeslagen op), `updatedAt`, `deletedAt`, `rev`, `origin`, `schemaVersion` | Zoals bij Item |
| `url` | Oorspronkelijke link, ongewijzigd bewaard |
| `normalizedUrl` | Zonder `www.`, `#`, slotslash en trackingparameters (`utm_*`, `fbclid`, …). Gebruikt voor duplicaatherkenning |
| `title`, `site`, `description`, `imageUrl` | **Externe broninformatie** |
| `infoVia` | Herkomst van de externe informatie: `handmatig`, `deelmenu`, `import`, `voorbeeld` of `opgezocht` |
| `note` | **Eigen notitie**: waarom is dit interessant. Wordt in de UI apart getoond |

Wordt dezelfde link opnieuw bewaard, dan gebruikt de app de bestaande bron. Lege velden worden
aangevuld en een nieuwe notitie wordt toegevoegd; bestaande tekst wordt nooit overschreven.

### Link (relatie)

`{ id, aKind, aId, bKind, bId, createdAt, updatedAt, deletedAt }`. Een relatie is ongericht: item↔item
of item↔bron. Ontkoppelen is zacht en kan ongedaan worden gemaakt. 

### Revision (historie)

`{ id, kind, entityId, rev, snapshot, changedAt }`. De `snapshot` is de volledige versie **vóór** een
wijziging. Wijzigingen binnen 2 minuten na de vorige revisie vallen samen: één revisie per bewerksessie,
niet per toetsaanslag. Het detailscherm toont per revisie wat er anders was en laat die versie terugzetten.
Terugzetten is zelf ook weer een wijziging met revisie.

### Meta

Sleutel-waarde: `lastExportAt`, en voor synchronisatie `sync:repo`, `sync:token`, `sync:lastAt`, `sync:lastPrint`, `sync:error`.
De meta-tabel gaat **nooit** mee in een back-up (de sleutel blijft op het toestel).

## Uitwisseling met Claude

Eén bestandsformaat, beschreven in `INDELEN.md`: `bijdehand-voorstellen` (voorstellen van Claude, via de privé repo). Voorstellen worden gecontroleerd tegen het register in
`itemTypes.ts`; wat in orde is, wordt via de gewone schrijfacties toegepast (met revisies).

## Afgeleid (niet opgeslagen)

Zoekresultaten, "Aandacht nodig" en "Binnenkort", tellers en het regelgebaseerde voorstel tijdens
het typen worden steeds opnieuw berekend.

## Back-upformaat (versie 1)

```json
{
  "format": "bijdehand-backup",
  "formatVersion": 1,
  "schemaVersion": 1,
  "exportedAt": "2026-10-24T10:00:00.000Z",
  "appVersion": "2026-10-24.5-soort-zaak",
  "counts": { "items": 28, "sources": 2, "links": 2, "revisions": 0 },
  "data": { "items": [], "sources": [], "links": [], "revisions": [] }
}
```

- De back-up bevat alles, ook items in de prullenbak en alle revisies.
- **Herstellen** valideert eerst het hele bestand. Bij een fout wordt niets geschreven; een back-up
  uit een nieuwere versie wordt geweigerd. Daarna volgt één transactie:
  - **Samenvoegen** (standaard): nieuwe records erbij, en de nieuwste `updatedAt` wint. Er wordt
    niets verwijderd. Een bron met dezelfde link wordt samengevoegd met de bestaande en de
    koppelingen worden omgezet.
  - **Vervangen**: eerst wordt automatisch een vangnet-back-up gedownload, daarna volgt de
    bevestiging en wordt de inhoud exact teruggezet.

## Migraties

| Versie | Wijziging |
|---|---|
| 1 → 2 | Restaurant: `location` heet nu `city`; nieuw `cuisine`, `traits`, `address`. Lijstwaarden in `fields` toegestaan. Planten en andere soorten houden hun velden |
| 2 → 3 | Restaurant: sterren `rating` (1–5) worden eigen cijfer `score` = sterren × 2. Boeken, albums en games houden hun sterren |
| 4 → 5 | Verwijderde soorten (cadeau, nachtje weg, boek, kleermaat, game, klus, plant; D25) gaan naar de **Inbox** (`type: null`). Alle velden blijven bewaard (ook in back-ups); de oude soort en de ingevulde velden komen als regel *Was: Boek (author: …)* in de notities. Een voorstel van een verwijderde soort vervalt. Back-ups met zulke items worden geaccepteerd en zo omgezet |
| 3 → 4 | Restaurant: `status` vervalt. *favoriet* → `favorite: true`; *geweest*/*favoriet* zonder cijfer → `visited: true`; *proberen* → niets (= nog niet geweest) |

De omzetting staat in `src/data/migrate.ts` en wordt gebruikt bij het openen van de database (Dexie
`.version(n).upgrade`), bij het terugzetten van een back-up en bij het terugzetten van een oude revisie.

Bij een schemawijziging verhoog je `SCHEMA_VERSION`, voeg je in `db.ts` een nieuwe `.version(n)`
met `upgrade()` toe (pas nooit een bestaande versie aan) en laat je `parseBackup` oudere versies
omzetten. Test dit met een export van de vorige versie. Bij een nieuwe soort verandert alleen
`TypeKey` plus het register; er is geen databasemigratie nodig.
