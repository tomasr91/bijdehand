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
import { traitsLine, VENUE } from '../components/cards';

const NL: L.LatLngExpression = [52.2, 5.3];

function popupContent(item: Item, onOpen: (id: string) => void): HTMLElement {
  const box = document.createElement('div');
  box.className = 'map-pop';
  const title = document.createElement('b');
  title.textContent = item.title;
  box.append(title);
  const v = typeof item.fields.venue === 'string' ? VENUE[item.fields.venue] : undefined;
  const sub = [v ? `${v.mark} ${v.label}` : '', traitsLine(item, 2), typeof item.fields.score === 'number' ? `mijn cijfer ${formatScore(item.fields.score)}` : ''].filter(Boolean).join(' · ');
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
  const key = located.map((i) => `${i.id}:${i.fields.lat},${i.fields.lng}:${i.fields.score ?? ''}:${i.fields.venue ?? ''}:${i.fields.visited ?? ''}`).join('|');

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    for (const item of located) {
      const been = hasBeen(item);
      // Vorm = soort zaak (ruit fine dining, rond restaurant, vierkant bistro, klein rondje casual);
      // gevuld met je cijfer = geweest, open = nog niet.
      const venue = typeof item.fields.venue === 'string' && VENUE[item.fields.venue] ? item.fields.venue : 'onbekend';
      const score = typeof item.fields.score === 'number' ? formatScore(item.fields.score) : '';
      const html = `<span class="pin-shape"></span>${score ? `<span class="pin-score">${score}</span>` : ''}`;
      const marker = L.marker([item.fields.lat as number, item.fields.lng as number], {
        icon: L.divIcon({ className: `map-pin v-${venue} ${been ? 'been' : 'not'}`, html, iconSize: [30, 30], iconAnchor: [15, 15] }),
        title: item.title,
        alt: item.title,
        riseOnHover: true,
      });
      marker.bindPopup(() => popupContent(item, onOpen), { closeButton: false, autoPanPadding: [24, 24], offset: [0, -10] });
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

/** Uitleg van de vormen onder de kaart. */
export function MapLegend() {
  return (
    <p className="map-legend">
      <span><b>◆</b> ruit = fine dining</span>
      <span><b>●</b> rond = restaurant</span>
      <span><b>■</b> vierkant = bistro / eetcafé</span>
      <span><b>•</b> klein = snel &amp; casual</span>
      <span>gevuld met cijfer = geweest</span>
    </p>
  );
}
