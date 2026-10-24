# PRODUCT — Bijdehand

Labels: **[Gebouwd]** werkt en is getest · **[Gewenst]** besloten, nog niet gebouwd ·
**[Onderzoek]** eerst uitzoeken · **[Aanname]** niet bevestigd door de eigenaar.

## Visie

Bijdehand vervangt Google Keep als persoonlijk geheugen. Iets opslaan moet net zo snel gaan als
in Keep. Daarna moet de app veel meer overzicht, context, verbanden en bruikbaarheid bieden.
Het voelt als een mix van persoonlijke assistent, inspiratiebibliotheek en praktisch
huishoudelijk dashboard. Het is geen generieke notitie-app en geen projectmanagementsysteem.

## Gebruiker en behoefte

- **Eén gebruiker:** de eigenaar. Primair op een Android-telefoon, onderweg, vaak met één hand.
  Desktop is aanvullend en mag nooit ten koste gaan van mobiel.
- **Probleem:** de Keep-notities zijn losse, onoverzichtelijke lijstjes zonder structuur,
  status, verbanden of bron. Daardoor is informatie moeilijk terug te vinden en te gebruiken.

## Ontwerpprincipes

1. Opslaan gaat razendsnel. Er hoeft niet eerst een categorie of veld gekozen te worden.
2. Informatie krijgt waar mogelijk automatisch structuur (voorstel), maar de gebruiker beslist.
3. Filteren, doorzoeken en terugvinden gaat makkelijk, ook bij duizenden items.
4. Gerelateerde informatie is te verbinden.
5. De app blijft rustig en overzichtelijk.
6. Originele informatie en bronlinks gaan nooit ongemerkt verloren.
7. De app is gebouwd voor langdurig gebruik, niet als demo.

## De tien soorten informatie — **[Gebouwd]**

Bevestigd door de eigenaar (besluit D02). Velden staan in `DATA_MODEL.md`.

| # | Soort | Groep | Eigen weergave |
|---|---|---|---|
| 1 | Cadeaus | Inspiratie | Gegroepeerd per persoon; gelegenheid, budget, status |
| 2 | Nachtjes weg | Inspiratie | Bestemming, prijsindicatie, status; redenen en links in detail |
| 3 | Restaurants | Inspiratie | Gegroepeerd per plaats; keuken, kenmerken (bijv. fancy, vegetarisch, zingende bediening), eigen cijfer 1–10 (leeg = nog niet geweest), favoriet (hartje), website en route; filter op geweest en op label; sober lijst en detail |
| 4 | Boeken | Inspiratie | Auteur, status (wil lezen / bezig / gelezen), sterren |
| 5 | Albums | Inspiratie | Artiest, status (ontdekken / beluisteren / opnieuw / geluisterd) |
| 6 | Kleermaten | Naslag | Per persoon gegroepeerd: kledingtype, maat, merk, datum; eerdere versies |
| 7 | Games | Inspiratie | Platform, status (verlanglijst / spelen / uitgespeeld) |
| 8 | Paklijsten | Praktisch | Checklist met voortgang; herbruikbare basislijsten om te kopiëren |
| 9 | Klussen en to-do's | Praktisch | Status, prioriteit, deadline, materialen; snel afvinken |
| 10 | Plantenonderhoud | Naslag | Locatie, verzorging, interval, volgende datum; "verzorgd" met één tik |

De groepering (Inspiratie, Praktisch, Naslag) en de soorten staan in één register
(`src/data/itemTypes.ts`). Daardoor is uitbreiden mogelijk zonder het gegevensmodel te wijzigen.

## Hoofdschermen

| Scherm | Inhoud | Status |
|---|---|---|
| Vandaag | (Startpagina is Verzamelingen.) Toevoegknop, Inbox-melding, "Aandacht nodig" (te laat/vandaag/hoge prioriteit), "Binnenkort", recent bewaard, back-upwaarschuwing | [Gebouwd]; AI-suggesties [Gewenst] fase 2 |
| Inbox | Items zonder soort, met regelgebaseerd voorstel en "Indelen" in één tik | [Gebouwd] (bereikbaar via Vandaag en Verzamelingen) |
| Verzamelingen | Inbox + tien soorten in drie groepen, met tellers | [Gebouwd] |
| Toevoegen | Bottom sheet: tekst, link of checklist; soort optioneel | [Gebouwd] |
| Bronnen | Bibliotheek van links met eigen notitie en koppelingen; externe informatie apart van eigen notitie | [Gebouwd]; automatisch ophalen [Gewenst] fase 2 |
| Zoeken | Tekst + filters (soort, status, tag, items/bronnen); vraagwoorden genegeerd | [Gebouwd]; semantisch zoeken [Gewenst] fase 2 |
| Instellingen | Back-up/herstel, opslagstatus, installeren, prullenbak, voorbeeldgegevens, beperkingen | [Gebouwd] |

## Belangrijkste functies en status

| Functie | Status |
|---|---|
| Snel bewaren (tekst, link plakken, checklist); geplakte link wordt herkend | [Gebouwd] |
| Voorstel voor soort op basis van woorden en websites (vaste regels, geen AI) | [Gebouwd] |
| Aanmaken, bekijken, wijzigen (autosave), verwijderen met ongedaan maken + prullenbak | [Gebouwd] |
| Koppelingen item↔item en item↔bron | [Gebouwd] |
| Lijst plakken: een Keep-lijstje (één regel per item) in één keer toevoegen, met voorbeeld, duplicaatcontrole en ongedaan maken; restaurants als "Plaats - Naam (kenmerken)" | [Gebouwd] |
| Aantekeningen laten indelen door Claude (route 1): Inbox delen → voorstellenbestand → beoordelen en toepassen; ingevulde velden gemarkeerd | [Gebouwd] — werkwijze in `INDELEN.md` |
| Kaart met restaurants (en later andere plekken) | [Gewenst] fase 2 — zie `ARCHITECTURE.md` → Kaart |
| Eerdere versies bekijken en terugzetten (o.a. kleermaten) | [Gebouwd] |
| Duplicaatwaarschuwing (zelfde titel) en dezelfde link nooit dubbel als bron | [Gebouwd] |
| Export en herstel (samenvoegen of vervangen met vangnet-back-up) | [Gebouwd] |
| Lokale opslag op het apparaat, offline bruikbaar, installeerbaar (PWA) | [Gebouwd] |
| Link ontvangen via het Android-deelmenu | Gebouwd, **niet getest op een toestel** — zie `ARCHITECTURE.md` |
| Import vanuit Google Keep (Takeout) | [Gewenst] fase 2 |
| Automatische classificatie, samenvattingen, bronverrijking, semantisch zoeken (AI) | [Gewenst] fase 2 |
| Synchronisatie telefoon ↔ desktop | [Onderzoek] B3 |
| Meldingen, terugkerende taken, updates van bronnen | [Onderzoek] fase 3, B5 |
| Spraak- en afbeeldingsinvoer | [Onderzoek] later |

## Wat de app nadrukkelijk niet moet worden

- Geen generieke notitie-app waarin alles in één tekstveld belandt.
- Geen projectmanagementsysteem (geen projecten, afhankelijkheden of planning).
- Geen samenwerkings- of social-app.
- Geen agenda.
- Geen wachtwoordkluis: geen geheimen opslaan.
- Geen schijnslimheid: AI of "automatisch bijwerken" alleen als het echt werkt, en altijd herkenbaar.
