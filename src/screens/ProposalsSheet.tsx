import { CircleAlert, MessageCircleQuestion } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Sheet, TypeIcon } from '../components/ui';
import { applyProposals, undoApply, type ParsedProposals, type ProposalRow } from '../data/claude';
import { optionLabel, TYPE_MAP } from '../data/itemTypes';
import type { FieldValue, TypeKey } from '../data/model';
import { formatDateTime, formatScore } from '../data/util';
import { useToast } from '../ui/context';

function fieldSummary(type: TypeKey, velden: Record<string, FieldValue> = {}): string[] {
  const out: string[] = [];
  for (const f of TYPE_MAP[type].fields) {
    const v = velden[f.key];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    const shown = Array.isArray(v) ? v.join(', ') : f.kind === 'rating' ? `${v}★` : f.kind === 'score' && typeof v === 'number' ? formatScore(v) : optionLabel(type, f.key, v);
    out.push(`${f.label}: ${shown}`);
  }
  return out;
}

const STATUS_TEXT: Record<string, string> = { gewijzigd: 'Let op', fout: 'Kan niet', laten: 'Blijft in Inbox' };

/** Voorstellen van Claude beoordelen: per voorstel aan/uit, daarna in één keer toepassen. */
export function ProposalsSheet({ value, onClose }: { value: ParsedProposals | null; onClose: () => void }) {
  const toast = useToast();
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!value) return;
    setChosen(new Set(value.rows.map((r, i) => (r.status === 'ok' ? i : -1)).filter((i) => i >= 0)));
    setBusy(false);
  }, [value]);

  const rows = value?.rows ?? [];
  const selectable = (r: ProposalRow) => r.status === 'ok' || r.status === 'gewijzigd';
  const toggle = (i: number) => setChosen((c) => { const n = new Set(c); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  const apply = async () => {
    setBusy(true);
    try {
      const res = await applyProposals(rows.filter((_, i) => chosen.has(i)), rows);
      onClose();
      const parts = [res.updated && `${res.updated} ingedeeld`, res.created && `${res.created} nieuw`, res.trashed && `${res.trashed} ${res.trashed === 1 ? 'aantekening' : 'aantekeningen'} naar prullenbak`].filter(Boolean);
      toast(parts.join(', ') || 'Niets toegepast', { action: { label: 'Ongedaan maken', run: async () => { await undoApply(res.undo); toast('Voorstellen teruggedraaid'); } } });
    } catch (e) {
      console.error(e);
      toast('Toepassen is mislukt.', { tone: 'error' });
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={!!value}
      onClose={onClose}
      title="Voorstellen van Claude"
      footer={
        <button type="button" className="btn btn-primary btn-block" disabled={!chosen.size || busy} onClick={() => void apply()}>
          {chosen.size ? `${chosen.size} toepassen` : 'Kies voorstellen'}
        </button>
      }
    >
      {value?.createdAt && <p className="hint">Gemaakt {formatDateTime(value.createdAt)}. Alles is daarna nog te wijzigen of ongedaan te maken.</p>}
      <ul className="proposals">
        {rows.map((r, i) => {
          const p = r.p;
          const def = p.type ? TYPE_MAP[p.type] : undefined;
          const head = p.actie === 'indelen' ? `Indelen als ${def?.label.toLowerCase()}` : p.actie === 'nieuw' ? `Nieuw: ${def?.label.toLowerCase() ?? ''}` : p.actie === 'aanvullen' ? 'Aanvullen' : 'Laten staan';
          const title = p.titel || r.item?.title || '—';
          return (
            <li key={p.id + i} className={`proposal s-${r.status}`}>
              {selectable(r) ? (
                <button type="button" className="check" role="checkbox" aria-checked={chosen.has(i)} aria-label={`${head}: ${title}`} onClick={() => toggle(i)} />
              ) : (
                <span className="proposal-icon" aria-hidden="true">{r.status === 'laten' ? <MessageCircleQuestion size={20} /> : <CircleAlert size={20} />}</span>
              )}
              <div className="proposal-body">
                <span className="proposal-head">
                  <TypeIcon type={p.type ?? null} size={14} /> {head}
                  {STATUS_TEXT[r.status] && <em className={`badge b-${r.status}`}>{STATUS_TEXT[r.status]}</em>}
                </span>
                <b>{title}</b>
                {(p.actie === 'indelen' || p.actie === 'aanvullen') && r.item && p.titel && p.titel !== r.item.title && <small>was: {r.item.title}</small>}
                {p.links && p.links.length > 0 && <small>Links: {p.links.map((l) => l.titel || l.url).join(', ')}</small>}
                {p.actie === 'nieuw' && r.item && <small>uit: {r.item.title}</small>}
                {p.type && fieldSummary(p.type, p.velden).length > 0 && (
                  <span className="mini-tags">{fieldSummary(p.type, p.velden).map((t) => <span key={t}>{t}</span>)}</span>
                )}
                {p.type && p.weghalen && Object.entries(p.weghalen).map(([k, vals]) => vals.length > 0 && (
                  <small key={k} className="problem">Weghalen uit {(TYPE_MAP[p.type!].fields.find((f) => f.key === k)?.label ?? k).toLowerCase()}: {vals.join(', ')}</small>
                ))}
                {p.tags && p.tags.length > 0 && <small>Tags: {p.tags.map((t) => `#${t}`).join(' ')}</small>}
                {p.checklist && p.checklist.length > 0 && <small>Checklist: {p.checklist.length} punten</small>}
                {r.problem && <small className="problem">{r.problem}</small>}
                {p.reden && <small className="reason">{p.reden}</small>}
              </div>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
