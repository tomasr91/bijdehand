// Kleine, pure hulpfuncties (unit-getest in util.test.ts).

/** Tijd-sorteerbare unieke ID (UUID v7-indeling). Werkt ook buiten een secure context. */
export function newId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let ms = Date.now();
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ms & 0xff;
    ms = Math.floor(ms / 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Lokale datum als YYYY-MM-DD. */
export function localDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return localDate(new Date(y, m - 1, d + days));
}

/** Aantal dagen van `from` tot `to` (beide YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

export function formatDate(date: string): string {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return date;
  const thisYear = new Date().getFullYear();
  return `${d} ${MONTHS[m - 1]}${y !== thisYear ? ` ${y}` : ''}`;
}

/** "vandaag", "morgen", "over 3 dagen", "2 dagen te laat", of een datum. */
export function relativeDay(date: string, today = localDate()): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return 'vandaag';
  if (diff === 1) return 'morgen';
  if (diff === -1) return 'gisteren';
  if (diff > 1 && diff <= 7) return `over ${diff} dagen`;
  if (diff < -1) return `${-diff} dagen te laat`;
  return formatDate(date);
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${formatDate(localDate(d))}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Kleine letters, zonder accenten — voor zoeken en vergelijken. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/i;

export function findUrl(text: string): string | null {
  const m = text.match(URL_RE);
  if (!m) {
    const bare = text.trim();
    if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(bare) && !bare.includes(' ')) return `https://${bare}`;
    return null;
  }
  return m[0].replace(/[).,;!?]+$/, '');
}

export function isUrl(text: string): boolean {
  const t = text.trim();
  return !!t && findUrl(t) !== null && (findUrl(t) === t || findUrl(t) === `https://${t}`);
}

const TRACKING = /^(utm_|fbclid$|gclid$|mc_|igshid$|si$|ref$|ref_src$)/i;

/** Genormaliseerde vorm om dezelfde link te herkennen (zonder tracking, www, #, slash). */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = '';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
    const keep = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b));
    u.search = keep.length ? '?' + new URLSearchParams(keep).toString() : '';
    const path = u.pathname.replace(/\/+$/, '');
    return `${u.hostname}${u.port ? ':' + u.port : ''}${path}${u.search}`;
  } catch {
    return raw.trim().toLowerCase();
  }
}

export function siteOf(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Lokale kalenderdag van een ISO-tijdstip. */
export function dayOf(iso: string): string {
  return localDate(new Date(iso));
}

/** Eigen cijfer als "7,5" of "8". */
export function formatScore(n: number): string {
  return n.toLocaleString('nl-NL', { maximumFractionDigits: 1 });
}

/** "7,5" of "7.5" → 7.5; null als het geen cijfer van 1 t/m 10 is. Afgerond op één decimaal. */
export function parseScore(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d{1,2}(\.\d+)?$/.test(t)) return null;
  const n = Math.round(Number(t) * 10) / 10;
  return n >= 1 && n <= 10 ? n : null;
}
