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
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker niet geregistreerd', e));
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
