# INDELEN — aantekeningen laten indelen door Claude

Status: werkwijze en app-ondersteuning **[Gebouwd]** (via de privé repo). De notaties per soort zijn een **voorstel**
dat de eigenaar bijschaaft. Claude volgt dit document; pas het aan als je iets anders wilt.

## Werkwijze

Zet aantekeningen ongesorteerd in Bijdehand (Toevoegen, zonder soort). Ze komen in de **Inbox**.

**Hoe het werkt [Gebouwd]:** de app staat gekoppeld aan de privé repo `bijdehand-data` (Instellingen → Synchronisatie) en
zet daar automatisch `data/bijdehand.json` neer. Claude zet voorstellen in `voorstellen/`. De app past bij de volgende
synchronisatie alles toe wat **ok** is (zonder te vragen; met een melding en *Ongedaan maken*) en verwijdert het bestand.
Wat "let op" of "kan niet" is, blijft gewoon in de Inbox staan.

Het gedeelde bestand bevat alleen de Inbox-items (titel, tekst, checklist, tags, links), de velden per
soort en bestaande schrijfwijzen (zoals plaatsen en kenmerken). Er gaat niets anders mee.

## Regels voor Claude

1. **Alleen wat er staat.** Verzin geen adressen, auteurs, prijzen of datums die niet in de aantekening
   staan. Eigen kennis mag alleen als `reden` ("Andy Weir is de auteur — controleer"), niet als veld.
2. **Bij twijfel: laten staan.** Gebruik actie `laten` en stel in `reden` één concrete vraag. Doe dit
   bijvoorbeeld bij een onduidelijke soort, of als een plaats ook een restaurantnaam kan zijn.
3. **Niets weggooien.** De tekst die niet in een veld past, blijft in `tekst` (Mijn notities). Splits je
   een aantekening, dan krijgt elk nieuw item zijn deel van de tekst.
4. **Bestaande schrijfwijzen volgen.** Gebruik de waarden onder `bekend` (bijv. "Leiden", "fancy")
   in plaats van een nieuwe variant ("utrecht", "chique").
5. **Eén aantekening, meerdere dingen?** Gebruik voor elk ding `nieuw` met hetzelfde `itemId`. De
   aantekening gaat na toepassen naar de prullenbak; de oorspronkelijke tekst blijft bij elk nieuw item.
6. **Datums** als `JJJJ-MM-DD`. Relatieve datums ("volgende vrijdag") reken je vanaf `gebaseerdOp`,
   en dat meld je in `reden`.
7. **Kenmerken en tags:** kleine letters, kort ("kleine gerechten", niet "ze hebben kleine gerechtjes").
8. **Titels:** de naam zelf, zonder de soort ervoor ("Pamir", niet "Restaurant Pamir"), tenzij
   dat de echte naam is ("Restaurant 512").

## Notatie per soort

Zo kun je een aantekening opschrijven zodat Claude hem zeker goed indeelt. "Lijst plakken" in de app
herkent nu alleen de restaurantnotatie; bij andere soorten wordt daar elke regel een titel. Schrijf je het anders, dan probeert Claude het toch, maar met meer kans op `laten`.

| Soort | Notatie | Voorbeeld | Velden |
|---|---|---|---|
| Restaurant | `Plaats - Naam (keuken, kenmerken)` | `Leiden - Pamir (Afghaans, reserveren)` | city, cuisine, traits (labels). Geen status: "geweest" volgt uit je eigen cijfer; dat en `favorite` vult Claude nooit in |
| Cadeau | `Cadeau Persoon: idee (gelegenheid, €budget)` | `Cadeau Sanne: fotoboek (verjaardag, €40)` | person, occasion, budget, status (standaard *idee*) |
| Nachtje weg | `Weg Plaats: accommodatie (prijs, waarom)` | `Weg Gent: hotel aan de Graslei (€140/nacht, mooie binnenstad)` | destination, accommodation, price, reasons |
| Boek | `Boek: Titel - Auteur (status)` | `Boek: Klara and the Sun - Kazuo Ishiguro` | author, status (standaard *wil*) |
| Album | `Album: Titel - Artiest` | `Album: Blue - Joni Mitchell (opnieuw)` | artist, status |
| Game | `Game: Titel (platform)` | `Game: Hades II (pc)` | platform, status (standaard *verlanglijst*) |
| Kleermaat | `Maat Persoon: kledingtype maat merk` | `Maat ik: broek 32/34 Levi's 511` | person, garment, size, brand, date (= vandaag als niets staat) |
| Paklijst | `Paklijst Naam:` + één punt per regel | `Paklijst skiën:` / `- skibril` | checklist; `basislijst` in de naam → isTemplate |
| Klus | `Klus: wat (prio, deadline, materiaal)` | `Klus: kraan maken (hoog, 15-11, kraanleertjes)` | status (standaard *open*), priority, due, materials |
| Plant | `Plant Naam: locatie, elke N dagen water` | `Plant Monstera: woonkamer, elke 7 dagen` | location, care, intervalDays |

Herkenningswoorden zonder vaste notatie (een greep): *cadeau, kado, verjaardag* → Cadeau;
*hotel, b&b, weekendje* → Nachtje weg; *boek, lezen* → Boek; *klus, repareren, ophangen* → Klus.

**[Aanname] — nog te bepalen door de eigenaar:**

- Moet "fancy" bij restaurants een kenmerk blijven of een prijsniveau (€–€€€€) worden?
- Krijgen boeken, albums en games ook kenmerken (bijv. genre), net als restaurants?
- Wat is de standaardpersoon bij kleermaten als er alleen "maat broek 32" staat: "ik"?

## Restaurants opzoeken

Per restaurant zoekt Claude: adres, keuken, website (veld `website`, de eigen site van de zaak), prijsniveau (alleen als een bron het noemt), Google-cijfer
(van 5) en aantal, TheFork-cijfer (van 10) en aantal, Michelin-vermelding, of de zaak open is, en links
(website + de pagina waar het cijfer staat). Nooit reviewteksten; geen openingstijden als veld. Bij elk restaurant
staan `checkedAt`, `ratingSource` en wat onzeker is (`uncertain`). Niet gevonden = leeg laten.

**[Gebouwd]** een **samenvatting** (veld `summary`, 3–5 zinnen): wat voor zaak het is, de keuken, hoe het werkt (menu,
opzet), sfeer of ligging, en wat opvalt. Geen cijfers of prijzen in de samenvatting (die horen in hun eigen velden); openingsdagen alleen globaal. In eigen woorden, alleen uit feiten die in de bronnen staan, zonder reviewteksten te citeren. Google levert
soms zelf een korte beschrijving (`editorialSummary`); die mag als basis dienen, met de bron erbij.

**[Gebouwd]** **Soort zaak** (veld `venue`, verplicht bij opzoeken) — wat je kunt verwachten. In de app is alleen **fine dining**
zichtbaar: als gewoon label "Fine dining", vóór de keuken en andere labels, zonder symbool. De andere waarden blijven bewaard
maar worden niet getoond en er kan niet op gefilterd worden (wel op het label "Fine dining").

| Waarde | Wanneer | In de app |
|---|---|---|
| `finedining` | Proef-/gangenmenu, Michelinster of -vermelding als fine dining, chef's menu, wijnarrangement | label **Fine dining** |
| `restaurant` | Gewoon uit eten, à la carte of shared dining | niets |
| `bistro` | Ongedwongen: bistro, eetcafé, grand café, brouwerij met keuken, ook voor lunch/borrel | niets |
| `casual` | Streetfood, afhaal, lunchroom, snackbar | niets |

Daarnaast `experience: true` (🎭 Beleving) bij een show, pop-up, table d'hôte of geheim/verrassingsmenu. ⭐ (Michelin) en 🌱
(volledig vegetarisch/veganistisch) volgen vanzelf uit `michelin` en de labels.

**[Gebouwd]** **Labels** (veld `traits`): bij elk opgezocht restaurant bepaalt Claude ook 1–4 labels die zeggen **wat je er eet**.
Ze staan op het kaartje (de eerste drie), dus in één oogopslag moet duidelijk zijn wat voor keuken het is.

- **Wel:** de keuken (*indonesisch*, *afghaans*, *italiaans*, *frans*, *fusion*), dieet (*veganistisch* of *vegetarisch* als de hele
  kaart dat is, anders *vega-opties*; *glutenvrij*, *halal*), wat er centraal staat (*vis*, *vlees*, *rijsttafel*, *zeevruchten*) en
  de aanpak van de keuken (*biologisch*, *lokaal*, *farm to table*, *verrassingsmenu*). Meest typerende eerst, meestal de keuken.
- **Niet:** inrichting of praktische zaken (terras, open keuken, groepen, openingstijden), vermeldingen (Michelin), cijfers,
  prijzen of oordelen. Alleen wat de bronnen zeggen.
- **Vorm:** kleine letters, kort, bestaande schrijfwijzen volgen (`bekend`). Labels van de eigenaar blijven altijd staan.
  Een eerder door Claude gekozen label dat niet klopt, haalt Claude weg met `weghalen` (zie hieronder).

## Dagelijkse taak (route 2) — **[Gebouwd]**

Een geplande Claude-taak draait **één keer per dag** (en op verzoek van de eigenaar: "Bijdehand bijwerken").

1. Kloon `tomasr91/bijdehand` (code, openbaar) en `tomasr91/bijdehand-data` (gegevens, privé); `npm ci` in de code-repo.
2. `npx tsx scripts/claude-taak.ts todo ../bijdehand-data` geeft: Inbox-items, restaurants die nog niet zijn opgezocht
   (geen `checkedAt`), restaurants zonder bruikbaar adres (`adresNodig`: geen adres, of de app vond het niet op de kaart), bestaande schrijfwijzen (`bekend`), velden per soort (`soorten`) en `gebaseerdOp`.
   Items met een wachtend voorstel staan er niet in. Niets te doen → stoppen, niets committen.
3. Per Inbox-item: `indelen` / `nieuw` / `laten` volgens de regels hierboven. Wordt het een restaurant, dan meteen ook opzoeken
   (zelfde voorstel, velden hieronder). Per al ingedeeld restaurant zonder `checkedAt`: `aanvullen`.
   Per restaurant in `adresNodig`: `aanvullen` met het juiste adres (eigen website of Google/OSM). Heeft de zaak geen vast
   adres, zet dat dan in `uncertain` met de woorden "geen vast adres"; dan vraagt de taak er niet meer naar.
4. **Opzoeken (restaurant):** `venue` (soort zaak, zie hierboven), `experience` als het een beleving is, `city`, `cuisine`, `address` (altijd in de vorm *Straat huisnummer, postcode Plaats*, zonder
   toelichting of wijk tussen haakjes: de app zet het adres om naar een punt op de kaart), `website` (eigen site), `summary` (3–5 zinnen), `traits` (labels: keuken +
   vega/vegan, zie hierboven), `openStatus`, `checkedAt` (vandaag), `uncertain` (wat niet zeker is) en `links`. Cijfers en
   prijsniveau zijn verborgen in de app: niet nodig. Alleen feiten uit bronnen; niets gevonden = leeg laten.
5. Schrijf `voorstellen/JJJJ-MM-DD-UUMM.json` met `gebaseerdOp` uit stap 2, controleer met
   `npx tsx scripts/claude-taak.ts check ../bijdehand-data voorstellen/<bestand>` (moet "Alles in orde" geven) en commit
   **alleen dat bestand** in `bijdehand-data`. Nooit `data/bijdehand.json` wijzigen; nooit gegevens in de openbare code-repo.
6. Meld kort (Nederlands) wat er is ingedeeld en opgezocht, en welke items bewust zijn blijven staan (met de vraag).

## Voorstellenbestand (formaat versie 1)

```json
{
  "format": "bijdehand-voorstellen",
  "formatVersion": 1,
  "gemaaktOp": "2026-10-24T12:00:00Z",
  "gebaseerdOp": "<exportedAt uit het inbox-bestand>",
  "voorstellen": [
    {
      "id": "v1",
      "actie": "indelen",
      "itemId": "<id uit het inbox-bestand>",
      "type": "restaurant",
      "titel": "Pamir",
      "velden": { "city": "Leiden", "cuisine": "Afghaans", "status": "proberen" },
      "tekst": "Aanrader van Sanne",
      "tags": [],
      "reden": "Plaats + naam herkend; 'Afghaans' is een keuken."
    },
    { "id": "v2", "actie": "nieuw", "itemId": "<bron-aantekening>", "type": "book", "titel": "Klara and the Sun", "velden": { "status": "wil" } },
    { "id": "v3", "actie": "laten", "itemId": "<id>", "reden": "Is 'Sedap' een restaurant of een plant?" }
  ]
}
```

- `actie`: `indelen` (het Inbox-item krijgt een soort en velden), `nieuw` (nieuw item, eventueel uit een
  aantekening), `aanvullen` (bestaand item, gevonden via `zoek: { titel, city }`) of `laten` (blijft in de
  Inbox; `reden` is de vraag).
- `verwijderen`: alleen met `itemId`, naar de prullenbak (terug te zetten). Gebruik het alleen voor een dubbel item of iets
  wat aantoonbaar verkeerd is ingedeeld, altijd met `reden`.
- Dubbel voorkomen: `nieuw`/`indelen` voor iets dat er al staat (zelfde soort, naam en plaats) wordt niet toegepast.
  Gebruik dan `aanvullen`.
- `links`: optioneel `[{ url, titel }]`; elke link wordt één keer als bron bewaard en aan het item gekoppeld.
- `weghalen`: alleen bij `aanvullen`, bijv. `{ "traits": ["terras"] }`: haalt precies die waarden uit een lijstveld (hoofdletters
  maken niet uit). Wordt vóór `velden` toegepast, dus weghalen + opnieuw toevoegen herschikt de volgorde. De app toont het in rood bij
  het voorstel; ongedaan maken zet alles terug.
- **Aanvullen** ververst alleen *opgezochte* velden; `null` maakt een opgezocht veld leeg (bijv. een opgeloste onzekerheid), nooit een eigen veld (cijfers, prijsniveau, Michelin, status zaak, opgezocht op,
  bron, onzeker). Eigen velden (plaats, keuken, adres…) vult het alleen in als ze leeg zijn, of als Claude ze eerder invulde en je
  nog niet op *Gecontroleerd* tikte (dan mag Claude ze verbeteren); kenmerken worden
  aangevuld. Jouw eigen sterren en notities blijven altijd van jou.
- `type` en `velden` moeten voorkomen in het inbox-bestand (`soorten`). Keuzevelden gebruiken de
  waarden uit `opties`. Een onbekend veld of een ongeldige waarde maakt dat ene voorstel ongeldig.
- `titel`, `tekst`, `tags` en `checklist` zijn optioneel. `tekst` vervangt "Mijn notities" (de oude
  versie blijft in de geschiedenis). Tags en checklist worden aangevuld en niet vervangen.
- De app controleert alles en markeert per voorstel: **ok**, **let op** (item is na het delen gewijzigd
  of al ingedeeld; standaard uitgevinkt), **kan niet** (met reden) of **blijft in Inbox**.
- Toegepaste items tonen "Ingevuld door Claude" met de ingevulde velden, tot je op *Gecontroleerd* tikt.
