# CLAUDE.md — Bijdehand

@AGENTS.md

## Verhouding tussen CLAUDE.md en AGENTS.md

- `AGENTS.md` (hierboven geïmporteerd) bevat **alle** algemene ontwikkelregels, de projectstatus en
  de documentatiekaart. Het is de bron van waarheid.
- Dit bestand bevat **alleen** aanvullingen die specifiek zijn voor Claude Code.
- Herhaal hier geen regels uit `AGENTS.md`. Moet een regel voor alle tools gelden, zet hem in `AGENTS.md`.
- Bij een tegenstrijdigheid wint `AGENTS.md`; los de tegenstrijdigheid op in dezelfde sessie.

## Werkwijze voor Claude Code

- **Sessiestart:** lees `docs/ROADMAP.md` (huidige fase, volgende stap, open beslissingen) en de
  docs die bij de taak horen voordat je code leest of schrijft.
- **Grotere wijzigingen** (nieuwe functie, schemawijziging, nieuwe dependency): maak eerst een kort
  plan en leg het voor; begin pas na akkoord.
- **Open beslissing nodig?** Neem hem niet stilzwijgend. Vraag de eigenaar, of kies expliciet een
  tijdelijke aanname, label die als **[Aanname]** en zet hem bij de open beslissingen.
- **Taakvoortgang:** houd een takenlijst bij voor werk met meer dan twee stappen.
- **Testen:** draai na elke wijziging de relevante tests; mobiele viewport eerst.
- **Afronding van een sessie:** meld kort wat er veranderde, wat getest is, welke docs zijn bijgewerkt
  en wat de volgende stap is.
- **Communicatie:** Nederlands, beknopt en direct.
