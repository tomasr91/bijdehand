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

## De soorten informatie — **[Gebouwd]**

Oorspronkelijk tien (D02); op verzoek van de eigenaar teruggebracht tot wat hij gebruikt (D25). Een soort komt
terug als de eigenaar hem wil. Velden staan in `DATA_MODEL.md`.

| # | Soort | Groep | Eigen weergave |
|---|---|---|---|
| 1 | Restaurants | Inspiratie | Gegroepeerd per plaats; keuken, kenmerken (bijv. fancy, vegetarisch, zingende bediening), eigen cijfer 1–10 (leeg = nog niet geweest), favoriet (hartje), website en route; filter op geweest en op label; sober lijst en detail |
| 2 | Albums | Inspiratie | Artiest, status (ontdekken / beluisteren / opnieuw / geluisterd) |
| 3 | Paklijst | Praktisch | Vakantiepaklijst als checklist: hele lijst plakken, afvinken, alles uitvinken |

De groepering (Inspiratie, Praktisch) en de soorten staan in één register
(`src/data/itemTypes.ts`). Daardoor is uitbreiden mogelijk zonder het gegevensmodel te wijzigen.

## Hoofdschermen

| Scherm | Inhoud | Status |
|---|---|---|
| Inbox | Items zonder soort, met regelgebaseerd voorstel en "Indelen" in één tik; Claude deelt dagelijks in | [Gebouwd] (balk op het hoofdscherm als er iets in staat) |
| Verzamelingen | Het enige hoofdscherm: gebruikte soorten als tegels (grootste eerst), lege soorten ingeklapt, statusregel synchronisatie | [Gebouwd] (D15) |
| Toevoegen | Ronde knop rechtsonder → bottom sheet: tekst, link of checklist; soort optioneel | [Gebouwd] |
| Bronnen | Geen eigen scherm meer (D15): links horen bij een item en zijn daar te openen | [Gebouwd] |
| Zoeken | Vergrootglas in een verzameling: tekst + filters binnen die soort | [Gebouwd]; semantisch zoeken [Gewenst] fase 2 |
| Instellingen | Synchronisatie, back-up/herstel, opslagstatus, installeren, prullenbak, beperkingen | [Gebouwd] |

## Belangrijkste functies en status

| Functie | Status |
|---|---|
| Snel bewaren (tekst, link plakken, checklist); geplakte link wordt herkend | [Gebouwd] |
| Voorstel voor soort op basis van woorden en websites (vaste regels, geen AI) | [Gebouwd] |
| Aanmaken, bekijken, wijzigen (autosave), verwijderen met ongedaan maken + prullenbak | [Gebouwd] |
| Koppelingen item↔item en item↔bron | [Gebouwd] |
| Lijst plakken: een Keep-lijstje (één regel per item) in één keer toevoegen, met voorbeeld, duplicaatcontrole en ongedaan maken; restaurants als "Plaats - Naam (kenmerken)" | [Gebouwd] |
| Aantekeningen laten indelen door Claude: via de privé repo, dagelijks; automatisch toegepast met *Ongedaan maken*; ingevulde velden gemarkeerd | [Gebouwd] — werkwijze in `INDELEN.md` |
| Kaart met restaurants (en later andere plekken) | [Gebouwd] voor restaurants — zie `ARCHITECTURE.md` → Kaart |
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
