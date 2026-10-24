# GOOGLE_PLACES — sleutel aanmaken voor restaurantgegevens

Status: **[Gewenst]**. Voorbereiding voor de geplande taak die nieuwe restaurants aanvult (zie `ROADMAP.md`).
Gecontroleerd op 2026-10-24; Google wijzigt schermen en prijzen soms, dus kijk bij twijfel op de pagina's van Google zelf.

## Wat we gebruiken

- **Places API (New), Text Search**: één verzoek per restaurant ("Pamir, Leiden") met alleen de velden
  `displayName`, `formattedAddress`, `rating`, `userRatingCount`, `priceLevel`, `businessStatus`, `websiteUri`,
  `googleMapsUri` en `location`. Geen reviews.
- Cijfer, aantal en prijsniveau vallen in de tariefgroep **Enterprise**. Daarvoor geldt (sinds maart 2025) een gratis
  tegoed van **1.000 verzoeken per maand**. Voor een paar restaurants per maand, plus een maandelijkse verversing van je hele
  lijst, blijf je daar ruim onder. Daarboven kost het ongeveer $35 per 1.000 verzoeken.

## Stappen

1. Ga naar **console.cloud.google.com** en log in met je Google-account.
2. Maak een **nieuw project**, bijvoorbeeld "bijdehand".
3. **Facturering:** koppel een factureringsaccount. Google vraagt een betaalkaart, ook als je binnen het gratis tegoed blijft.
4. **Budgetmelding:** Facturering → Budgetten en meldingen → maak een budget van bijvoorbeeld €1 met een e-mailmelding.
5. **API aanzetten:** APIs en services → Bibliotheek → zoek **"Places API (New)"** → Inschakelen.
6. **Sleutel maken:** APIs en services → Inloggegevens → Inloggegevens maken → **API-sleutel**.
7. **Sleutel beperken:** open de sleutel → bij *API-beperkingen* kies "Sleutel beperken" en vink alleen **Places API (New)** aan → Opslaan.
8. **Daglimiet (aanrader):** APIs en services → Places API (New) → Quota's → zet *Text Search requests per day* op bijvoorbeeld **50**.
   Zelfs een fout in de taak kan dan nooit veel kosten.
9. Bewaar de sleutel in je wachtwoordmanager.

## Veiligheid

- **Deel de sleutel nooit in een chat**, ook niet met Claude, en zet hem nooit in de app of in de code.
- Bij het inrichten van de privé-repo en de geplande taak bepalen we waar de sleutel als geheim komt te staan.
- Uitgelekt? Verwijder de sleutel in de console en maak een nieuwe.
