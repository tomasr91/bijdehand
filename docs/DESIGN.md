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

- **Eén lijn (D25):** hoofdschermen (beginscherm, Restaurants, Uitjes, Dates, Congressen, Albums, Paklijst, Inbox) hebben de merkkop met daaronder een blok in de achtergrondkleur (filters of voortgang); detailschermen,
  Instellingen, Zoeken en Prullenbak een lichte kopbalk. Overal losse kaarten (titel 17 px vet, grijze regel eronder) en
  sectiekoppen in `--heading`.
- **Even hoog overal:** elke merkkop is één rij (terug · titel met ondertitel · hoogstens twee knoppen); titel en ondertitel
  blijven op één regel. Meer knoppen gaan naar het plakkende blok eronder.
- **Statusbalk:** zolang een merkkop in beeld is, krijgt `meta theme-color` de merkkleur (statusbalk/adresbalk van de browser); op andere schermen de paginakleur. In het manifest staat `theme_color` op de merkkleur: een geïnstalleerde app (Firefox, Chrome) kleurt de statusbalk daarmee, ook als de browser de wisselende `meta`-kleur niet volgt. De balk onderaan (bij de gebaren-streep) hoort bij Android/de browser en is niet te kleuren.
- **Merkkop:** op de hoofdschermen een donker terracotta vlak (`--brand #6b2d16`)
  met titel, cursieve ondertitel en een lijntekening op lage dekking; scrolt weg. Het lichte blok met de bediening schuift er
  overheen en blijft bovenaan plakken. Idee overgenomen van *Uit in 030*, in de eigen kleur. Kopjes in `--heading`.
- **Kleuren:** warm off-white (`--bg #f7f3ec`), crèmekleurige kaarten en één accentkleur terracotta
  (`--accent #b5532a`). Groepkleuren alleen in iconen: Inspiratie terracotta, Praktisch groen, Naslag
  blauw, Bronnen paars, Inbox grijs. Alleen een licht thema (op verzoek van de eigenaar): geen donkere modus, ook niet als het systeem donker is.
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

- **Merkkop** (D24): donker terracotta vlak (`--brand`) met **Bijdehand**, ondertitel *Alles wat je wilt onthouden.*,
  een eigen lijntekening (notitieboek) en het tandwiel. De inhoud schuift er met een afgeronde bovenkant overheen.
- **Inbox** als balk, alleen als er iets in staat.
- **Tegels** alleen voor soorten waar iets in zit, grootste eerst.
- Lege soorten staan er niet. Bij *Soort kiezen* (Toevoegen) staan eerst de soorten die je gebruikt; de rest ingeklapt
  onder **Andere soorten**.
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

**[Gebouwd]** Restaurants, uitjes en dates hebben een **eigen, sober detail** (`compactDetail`, `src/screens/PlaceDetail.tsx`; D26), belangrijkste eerst:

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
"Vandaag verzorgd"), velden, checklist, mijn notities, links en
verbanden, tags, eerdere versies en metadata.

## Weergave per soort

| Soort | Lijstweergave |
|---|---|
| Paklijst | Er is **één** paklijst (D23): de tegel op het hoofdscherm opent hem meteen, zonder tussenscherm; is er nog geen, dan een knop *Paklijst maken*. Geen ronde +; Toevoegen met soort Paklijst vult de bestaande lijst aan (dubbele punten overgeslagen). Detail: merkkop met de naam; daaronder plakt *N van M ingepakt* met voortgangsbalk en **Alles uitvinken** (met *Ongedaan maken*); de checklist als één kaart; daaronder notities. Een geplakte lijst met meerdere regels wordt per regel een punt, ook bij Toevoegen (D22) |
| Restaurants, Uitjes, Dates | Eigen scherm per soort, één bestand voor alle drie (`src/screens/Places.tsx`, D26; uitjes en dates hebben eigen lijntekeningen in de kop). Eén filterrij **Alle · Nog niet · Geweest** (afgeleid van je cijfer); labelfilter via de filterknop in de kopbalk (sheet met labels; actief filter als chip met ✕, stip op de knop). Merkkop met *N plekken · N geweest* en de knoppen zoeken en kaart; het filterblok plakt bovenaan: *Alle 30 · Nog niet 15 · Geweest 15* met rechts de labelfilterknop. Per plaats een kop in de merkkleur (*Utrecht · 26*), grootste plaats eerst, daaronder **losse kaarten**: de **naam**, daaronder de eerste drie labels (*Fine dining, frans, michelinster*; zie `INDELEN.md`); rechts **hartje** en **je cijfer**, of niets als je er nog niet was. Filter (kopbalk): labels, ook "fine dining". Volgorde: favorieten, dan cijfer hoog → laag, dan nog niet geweest (op naam). **Kaart** via het kaarticoon (D16): start ingezoomd op de plaats met de meeste restaurants; alle punten rond, gevuld met cijfer = geweest, open = nog niet, met uitleg onder de kaart; tik → popup met *Openen*; knop *Waar ben ik*; daaronder "N zonder locatie" |
| Albums | Merkkop (*8 albums · 2 geluisterd*), plakkend filter **Alle · Nog niet · Geluisterd** met aantallen, losse kaarten (titel vet, *artiest · status*) |
| Inbox | Merkkop (*N nog in te delen · Claude deelt elke ochtend in*), losse kaarten |

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
