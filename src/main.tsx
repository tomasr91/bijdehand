import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initRouter } from './ui/router';
import './styles.css';

initRouter();

// Installatie-aanbod van Chrome bewaren, zodat Instellingen een eigen knop kan tonen.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__installPrompt = e as unknown as { prompt: () => Promise<void> };
  window.dispatchEvent(new Event('bijdehand:installable'));
});

// Service worker alleen in de productiebuild: offline openen + installeerbaar.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    // updateViaCache 'none': de browser vraagt sw.js altijd vers op, zodat een nieuwe deployment meteen wordt gezien.
    navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' })
      .then((reg) => {
        // Bij terugkomen in de app ook kijken of er een nieuwe versie is.
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void reg.update().catch(() => {}); });
      })
      .catch((e) => console.warn('Service worker niet geregistreerd', e));
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
