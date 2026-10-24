// Kaart met restaurants (Leaflet + OpenStreetMap-tegels). Zie docs/ARCHITECTURE.md → D16.
// Punten: gevuld = geweest (met je cijfer erin), open rondje = nog niet geweest. Tik → naam, labels, "Openen".
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { hasBeen } from '../data/itemTypes';
import { hasLocation } from '../data/geocode';
import type { Item } from '../data/model';
import { formatScore } from '../data/util';
import { traitsLine } from '../components/cards';

const NL: L.LatLngExpression = [52.2, 5.3];

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function popupContent(item: Item, onOpen: (id: string) => void): HTMLElement {
  const box = document.createElement('div');
  box.className = 'map-pop';
  const title = document.createElement('b');
  title.textContent = item.title;
  box.append(title);
  const sub = [traitsLine(item), typeof item.fields.score === 'number' ? `mijn cijfer ${formatScore(item.fields.score)}` : ''].filter(Boolean).join(' · ');
  if (sub) {
    const s = document.createElement('span');
    s.textContent = sub;
    box.append(s);
  }
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-small btn-primary';
  btn.textContent = 'Openen';
  btn.addEventListener('click', () => onOpen(item.id));
  box.append(btn);
  return box;
}

export function RestaurantMap({ items, onOpen, onLocateError }: { items: Item[]; onOpen: (id: string) => void; onLocateError: (msg: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const me = useRef<L.CircleMarker | null>(null);
  const fittedFor = useRef('');
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { center: NL, zoom: 7, zoomControl: true, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    }).addTo(m);
    m.attributionControl.setPrefix(false);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  const located = items.filter(hasLocation);
  const key = located.map((i) => `${i.id}:${i.fields.lat},${i.fields.lng}:${i.fields.score ?? ''}`).join('|');

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const accent = cssVar('--accent', '#b5532a');
    const surface = cssVar('--surface', '#ffffff');
    for (const item of located) {
      const been = hasBeen(item);
      const marker = L.circleMarker([item.fields.lat as number, item.fields.lng as number], {
        radius: been ? 14 : 9,
        color: been ? surface : accent,
        weight: been ? 2 : 3,
        fillColor: been ? accent : surface,
        fillOpacity: 1,
      });
      marker.bindPopup(() => popupContent(item, onOpen), { closeButton: false, autoPanPadding: [24, 24] });
      marker.bindTooltip(item.title, { direction: 'top', offset: [0, -8] });
      if (typeof item.fields.score === 'number') {
        L.marker([item.fields.lat as number, item.fields.lng as number], {
          icon: L.divIcon({ className: 'map-score', html: formatScore(item.fields.score), iconSize: [30, 18], iconAnchor: [15, 9] }),
          interactive: false,
          keyboard: false,
        }).addTo(g);
      }
      marker.addTo(g);
    }
    // Inzoomen op wat zichtbaar is, alleen als de verzameling punten verandert (niet bij elke kleine wijziging).
    const ids = located.map((i) => i.id).sort().join(',');
    if (located.length && ids !== fittedFor.current) {
      fittedFor.current = ids;
      const bounds = L.latLngBounds(located.map((i) => [i.fields.lat as number, i.fields.lng as number] as L.LatLngTuple));
      m.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 });
    }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const locate = () => {
    if (!navigator.geolocation) { onLocateError('Je locatie is op dit toestel niet beschikbaar.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const m = map.current;
        if (!m) return;
        const ll: L.LatLngTuple = [pos.coords.latitude, pos.coords.longitude];
        me.current?.remove();
        me.current = L.circleMarker(ll, { radius: 8, color: '#ffffff', weight: 3, fillColor: '#2f6fde', fillOpacity: 1 }).addTo(m);
        m.setView(ll, Math.max(m.getZoom(), 14));
      },
      () => {
        setLocating(false);
        onLocateError('Je locatie kon niet worden bepaald. Sta locatie toe voor deze site.');
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <div className="map-wrap">
      <div ref={el} className="map" role="region" aria-label="Kaart met restaurants" />
      <button type="button" className="map-locate" aria-label="Waar ben ik" disabled={locating} onClick={locate}>
        <LocateFixed size={22} />
      </button>
    </div>
  );
}
