# DESIGN — Bijdehand

Status: **[Gebouwd]** tenzij anders vermeld. De tokens staan bovenaan `src/styles.css`.

## Principes

1. **Mobiel eerst, één hand.** Ontwerp en test op 360–412 px. Grotere schermen voegen ruimte toe,
   maar geen ander gedrag.
2. **Opslaan in één tik.** Een ronde toevoegknop rechtsonder, op elk scherm. Een soort kiezen is optioneel;
   zonder soort gaat het naar de Inbox en deelt Claude het 's ochtends in.
3. **Rustig.** Warme, neutrale kleuren, veel witruimte en geen statistieken of decoratie die de inhoud
   verdringt.
4. **Eerlijk.** Wat nog niet werkt, staat er niet. Beperkingen worden kort benoemd: bij herinneringen,
   bronnen, zoeken en onder "Wat nog niet kan" in Instellingen.
5. **Vergevingsgezind.** Ongedaan maken via een melding in plaats van bevestigingsvragen. Een
   bevestiging is er alleen bij onomkeerbare acties (definitief verwijderen, alles vervangen).

## Visuele stijl

- **Kleuren:** warm off-white (`--bg #f7f3ec`), crèmekleurige kaarten en één accentkleur terracotta
  (`--accent #b5532a`). Groepkleuren alleen in iconen: Inspiratie terracotta, Praktisch groen, Naslag
  blauw, Bronnen paars, Inbox grijs. Donkere modus volgt het systeem.
- **Typografie:** systeemlettertype, basis 16 px. Paginatitels 22–28 px vet, sectiekoppen 15 px
  gedempt.
- **Vormen:** kaarten met 14 px afgeronde hoeken, een dunne rand en een subtiele schaduw.
  Knoppen en chips zijn pilvormig.
- **Contrast:** gericht op WCAG AA; status wordt nooit alleen met kleur aangeduid (er staat altijd tekst bij).

## Aanraakvlakken en invoer

- Alle knoppen, links en velden zijn minstens **44 × 44 CSS-pixels**. De e2e-test controleert dit
  op elk hoofdscherm. De enige uitzondering is een tekstlink binnen een zin.
- Passende mobiele toetsenborden: `inputMode="url"` voor links, `decimal` voor bedragen, `numeric` voor
  aantallen, `type="date"` voor datums, plus `enterKeyHint`.
- Formulieren tonen standaard alleen de belangrijkste velden; de rest zit achter "Meer velden (n)".
- Selecties met weinig opties zijn chips, beoordeling met 5 grote sterren, ja/nee met een schakelaar.
- Er zijn geen tabellen en er is nergens horizontaal scrollen; de e2e-test controleert dit.

## Navigatie — **[Gebouwd]** (D15)

Er is **geen navigatiebalk**. Op verzoek van de eigenaar zijn er drie onderdelen: **Verzamelingen** (het enige
hoofdscherm, ook startpagina en `start_url`), **Instellingen** (tandwiel rechtsboven op het hoofdscherm) en
**Toevoegen** (ronde accentknop rechtsonder, 64 px; niet op de restaurantschermen — restaurants komen via de Inbox en Claude).

| Breedte | Indeling |
|---|---|
| < 900 px | Inhoud over de volle breedte; ronde knop rechtsonder boven de veilige zone |
| ≥ 900 px | Inhoud max. 720 px breed in het midden, knop rechtsonder naast de inhoud; sheets als gecentreerde dialoog |

- **Terugknop (Android):** sluit eerst een open sheet, gaat daarna terug; op het hoofdscherm sluit hij de app.
- Toevoegen vanuit een verzameling kiest die soort alvast en opent na opslaan het detail.
- **Zoeken** zit alleen nog als vergrootglas bovenaan een verzameling (zoekt binnen die soort).
- Vandaag en de lijst Bronnen bestaan niet meer. Een link zonder soort wordt een item in de Inbox met die link erbij;
  dezelfde link opnieuw bewaren maakt geen dubbel item maar verwijst naar het bestaande.
- De Prullenbak is bereikbaar via Instellingen (en onderaan het hoofdscherm als er iets in ligt).

## Hoofdscherm

- Kop **Bijdehand** met tandwiel. In de proefversie een melding.
- **Inbox** als balk, alleen als er iets in staat.
- **Tegels** alleen voor soorten waar iets in zit, grootste eerst.
- **Nog leeg: …** als één inklapbare regel; uitgeklapt als chips om een lege soort te openen.
- **Statusregel** synchronisatie: "Bijgewerkt <tijd> · Claude deelt elke ochtend in"; rood bij een fout; zonder
  koppeling "Alleen op dit toestel bewaard · GitHub koppelen".

## Schermhiërarchie

```text
Verzamelingen (start) ── Inbox ── item
              ├─ Instellingen ── Prullenbak
              └─ Soort (filters, groepering per soort; zoeken binnen de soort) ── item (detail = bewerken)
                                                                                 └─ bron (via de links van een item)
Toevoegen = bottom sheet boven het huidige scherm (ronde knop rechtsonder)
```

**[Gebouwd]** Restaurants hebben een **eigen, sober detail** (`compactDetail`, `src/screens/RestaurantDetail.tsx`), belangrijkste eerst:

1. **Kop:** naam (groot, bewerkbaar), **hartje** (favoriet, aan/uit) en rechts **Mijn cijfer** als groot vak (1–10, één decimaal, komma of punt; "–" = nog niet geweest; ongeldige invoer krijgt een melding en wordt niet bewaard).
2. **Plaats · keuken** in één regel, daaronder de **labels** als kleine, niet-klikbare chips.
3. **Website** en **Route** naast elkaar (Route = Google Maps-zoeklink op naam + adres of plaats; gewone link, geen sleutel).
4. **Samenvatting** ingekort tot 3 regels met "Meer lezen", en "Door Claude geschreven · datum".
5. **Mijn notities.**
6. **Gegevens bewerken** (ingeklapt): plaats, keuken, labels, adres (en favoriete gerechten als die er zijn).
7. **Restaurant verwijderen** (rode tekstknop): naar de prullenbak, met *Ongedaan maken*.

Geen soortkeuze bovenaan (wel in menu ⋮), geen Claude-melding, opgezochte cijfers, checklist, links, tags, eerdere versies of metadata.
Bij andere soorten is de melding "Ingevuld door Claude" één regel; "Wat?" toont welke velden.

Het detailscherm (andere soorten) toont van boven naar beneden: soortkeuze, titel, soortspecifieke actie (bijv.
"Vandaag verzorgd" of "Nieuwe reis van deze basislijst"), velden, checklist, mijn notities, links en
verbanden, tags, eerdere versies en metadata.

## Weergave per soort

| Soort | Lijstweergave |
|---|---|
| Cadeaus, Kleermaten | Gegroepeerd per persoon |
| Paklijsten | Secties "Basislijsten" en "Reizen", voortgangsbalk |
| Klussen | Open eerst, dan prioriteit en deadline; afvinkknop op de kaart |
| Planten | Op volgende verzorgingsdatum; "verzorgd"-knop op de kaart |
| Restaurants | Eigen scherm (`src/screens/Restaurants.tsx`). Eén filterrij **Alle · Nog niet · Geweest** (afgeleid van je cijfer); labelfilter via de filterknop in de kopbalk (sheet met labels; actief filter als chip met ✕, stip op de knop). Per plaats één blok met rijen en dunne scheidingslijnen; grootste plaats eerst. Rij: **naam** met symbolen (⭐ Michelin, 🌱 volledig vega/vegan, 🎭 beleving), daaronder **soort zaak** (◆◆◆ fine dining, ◆◆ restaurant, ◆ bistro/eetcafé, ◇ snel & casual) en hoogstens 2 labels; rechts **hartje** en **je cijfer**, of niets als je er nog niet was. Filter (kopbalk): soort zaak en labels. Volgorde: favorieten, dan cijfer hoog → laag, dan nog niet geweest (op naam). **Kaart** via het kaarticoon (D16): vorm per soort zaak (ruit fine dining, rond restaurant, vierkant bistro, klein casual), gevuld met cijfer = geweest, open = nog niet, met uitleg onder de kaart; tik → popup met *Openen*; knop *Waar ben ik*; daaronder "N zonder locatie" |
| Boeken, Albums, Games | Statusfilter-chips, sterren in de kaart |
| Nachtjes weg | Bestemming, prijsindicatie en status |

Filterchips voor een status zonder items worden verborgen.

Te laat staat in rood en vandaag in accentkleur, steeds met tekst ("2 dagen te laat").

## Feedback

- Melding (toast) onderaan bij bewaren, indelen, verwijderen en afronden, meestal met
  "Ongedaan maken" of "Openen". Is er een sheet open, dan verschijnt de melding bovenaan.
- Opslagstatus in de kopbalk van detailschermen.
- Afvinken geeft direct visuele bevestiging (groen vinkje, doorgestreept, teller "x van y").

## Herbruikbare componenten (`src/components`)

| Component | Doel |
|---|---|
| `TopBar` | Titel, terugknop, acties; sticky |
| `Sheet` | Bottom sheet / dialoog, sluit met terugknop, Escape of tik buiten |
| `ConfirmDialog` | Alleen voor onomkeerbare acties |
| `ItemCard`, `SourceCard` | Compacte kaart met samenvatting per soort en snelle actie |
| `TypeIcon`, `TypePicker` | Soorticoon (groepkleur) en keuzescherm per groep |
| `FieldsEditor` / `FieldEditor` | Typespecifieke velden met autosave; lijstveld (kenmerken) als chips met max. 6 suggesties |
| `ProposalsSheet` | Voorstellen van Claude: per voorstel aan/uit, status (ok / let op / kan niet / blijft in Inbox), reden van Claude |
| `PasteSheet` | Lijst plakken met live voorbeeld, duplicaten grijs en overgeslagen |
| `ChecklistEditor` | Afvinken, toevoegen, tekst wijzigen, verwijderen, alles weer open |
| `LinksSection`, `LinkPicker` | Bronnen en items koppelen/ontkoppelen |
| `TagEditor`, `HistorySection`, `SaveStatus` | Tags, eerdere versies, opslagstatus |
| `Segmented`, `ChipGroup`, `AutoText`, `Empty`, `Section`, `Stars` | Basisbouwstenen |

## Later — **[Gewenst]**

Lijst en detail naast elkaar op desktop, toetsenbordsneltoetsen (nu alleen Ctrl/Cmd+Enter om te
bewaren), spraak- en afbeeldingsinvoer.
