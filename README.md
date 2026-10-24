# Bijdehand

Persoonlijk, mobile-first geheugen dat Google Keep vervangt. Local-first PWA: alle gegevens staan op
het apparaat (IndexedDB), en de app werkt offline en is installeerbaar op Android.

- Werkregels en status: [AGENTS.md](AGENTS.md)
- Product, datamodel, architectuur, ontwerp en roadmap: [docs/](docs/)

## Draaien

```bash
npm install
npm run dev        # http://localhost:5173
npm run check      # typecheck, unit-tests, build, e2e (360 px, 412 px, desktop)
```

## Op je telefoon zetten

Elke push naar `main` wordt na typecheck, unittests en build automatisch gepubliceerd op GitHub Pages
(`.github/workflows/pages.yml`): <https://tomasr91.github.io/bijdehand/>.

Open die url in Chrome op Android → menu (⋮) → *App installeren*.

Deze repo is openbaar en bevat **nooit** persoonlijke gegevens of sleutels: gegevens staan op het toestel
(en straks in een aparte privé-repo); testvoorbeelden gebruiken verzonnen namen.

Let op: je gegevens horen bij dat webadres. Verhuis je naar een ander adres, maak dan eerst een
back-up (Instellingen → Back-up downloaden) en zet die op het nieuwe adres terug.
