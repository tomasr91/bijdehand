// Regelgebaseerd voorstel voor een soort. Bewust geen AI: transparant en offline.
// Het voorstel wordt nooit automatisch toegepast; de gebruiker bevestigt het (of niet).
import { TYPES } from './itemTypes';
import type { Suggestion } from './model';
import { fold, siteOf } from './util';

function hasWord(hay: string, word: string): boolean {
  const w = fold(word);
  if (w.includes(' ')) return hay.includes(w);
  return new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(hay);
}

export function suggestType(text: string, url?: string | null, checklistLines = 0): Suggestion | null {
  const hay = fold(text);
  let host = '';
  try {
    if (url) host = siteOf(url) + new URL(url).pathname;
  } catch {
    host = '';
  }
  let best: Suggestion | null = null;
  let bestScore = 0;
  for (const t of TYPES) {
    let score = 0;
    let reason = '';
    for (const h of t.hosts) {
      if (host.includes(h)) {
        score += 3;
        reason = `link naar ${siteOf(url!)}`;
        break;
      }
    }
    for (const k of t.keywords) {
      if (hasWord(hay, k)) {
        score += 2;
        if (!reason) reason = `bevat "${k}"`;
      }
    }
    if (t.key === 'packing' && checklistLines > 0 && score > 0) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = { type: t.key, reason, by: 'regels' };
    }
  }
  return bestScore >= 2 ? best : null;
}
