import { defineConfig, devices } from '@playwright/test';

// Mobiel eerst: alle tests op 360 px (smalste Android). Op 412 px en desktop alleen de lay-outcontroles
// (geen horizontaal scrollen, aanraakvlakken) en de kaart, zodat de check snel blijft.
const LAYOUT = /hoofdschermen|kaart met restaurants/;
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', locale: 'nl-NL', timezoneId: 'Europe/Amsterdam' },
  projects: [
    { name: 'android-360', use: { ...devices['Galaxy S9+'], viewport: { width: 360, height: 760 } } },
    { name: 'android-412', use: { ...devices['Pixel 7'] }, grep: LAYOUT },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }, grep: LAYOUT },
  ],
  webServer: { command: 'npm run preview -- --port 4173 --strictPort', port: 4173, reuseExistingServer: true },
});
