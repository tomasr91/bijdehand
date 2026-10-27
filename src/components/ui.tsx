import {
  Backpack, ChevronLeft, Disc3, Inbox, Link2, Star, Tent, UtensilsCrossed, Wine, X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { typeDef, type IconName } from '../data/itemTypes';
import type { TypeKey } from '../data/model';
import { goBack, useBackToClose } from '../ui/router';

const ICONS: Record<IconName, LucideIcon> = { UtensilsCrossed, Tent, Wine, Disc3, Backpack };

export function TypeIcon({ type, size = 20, source = false }: { type: TypeKey | null; size?: number; source?: boolean }) {
  const def = typeDef(type);
  const Icon = source ? Link2 : def ? ICONS[def.icon] : Inbox;
  const group = source ? 'bron' : def?.group ?? 'inbox';
  return (
    <span className={`type-icon g-${group}`} aria-hidden="true">
      <Icon size={size} strokeWidth={2} />
    </span>
  );
}

export function TopBar({ title, back, actions, sub }: { title: ReactNode; back?: string; actions?: ReactNode; sub?: ReactNode }) {
  return (
    <header className="topbar">
      {back !== undefined && (
        <button type="button" className="icon-btn" aria-label="Terug" onClick={() => goBack(back)}>
          <ChevronLeft size={24} />
        </button>
      )}
      <div className="topbar-title">
        <h1>{title}</h1>
        {sub && <div className="topbar-sub">{sub}</div>}
      </div>
      {actions && <div className="topbar-actions">{actions}</div>}
    </header>
  );
}

/** Lijntekeningen voor de merkkop (eigen, eenvoudig). */
export type BrandArtName = 'home' | 'restaurant' | 'activity' | 'date' | 'album' | 'packing' | 'inbox';

function BrandArt({ art }: { art: BrandArtName }) {
  return (
    <svg className="brand-art" viewBox="0 0 120 100" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {art === 'album' ? (
        <>
          {/* Plaat met arm */}
          <circle cx="54" cy="54" r="38" />
          <circle cx="54" cy="54" r="26" />
          <circle cx="54" cy="54" r="8" />
          <path d="M104 10v40l-22 22" />
          <circle cx="104" cy="10" r="4" />
        </>
      ) : art === 'packing' ? (
        <>
          {/* Koffer */}
          <rect x="18" y="30" width="84" height="62" rx="8" />
          <path d="M44 30V18h32v12M18 52h84M40 30v62M80 30v62" />
        </>
      ) : art === 'inbox' ? (
        <>
          {/* Bakje met briefjes */}
          <path d="M10 56l16-34h68l16 34v34H10z" />
          <path d="M10 56h30l6 12h28l6-12h30" />
          <path d="M40 40h40M44 30h32" />
        </>
      ) : art === 'activity' ? (
        <>
          {/* Tent met vlaggetje */}
          <path d="M10 90h100M60 90V50M60 50L22 90M60 50l38 40" />
          <path d="M60 50V14l22 8-22 8" />
          <path d="M48 90c0-8 6-14 12-14s12 6 12 14" />
        </>
      ) : art === 'date' ? (
        <>
          {/* Twee glazen */}
          <path d="M22 16h32c0 22-6 34-16 34S22 38 22 16zM38 50v36M26 86h24" />
          <path d="M66 16h32c0 22-6 34-16 34S66 38 66 16zM82 50v36M70 86h24" />
          <path d="M54 12l12 8" />
        </>
      ) : art === 'home' ? (
        <>
          {/* Opengeslagen notitieboek met potlood */}
          <path d="M14 30c14-6 28-6 44 2v56c-16-8-30-8-44-2z" />
          <path d="M102 30c-14-6-28-6-44 2v56c16-8 30-8 44-2z" />
          <path d="M24 44c8-2 16-2 24 2M24 56c8-2 16-2 24 2M24 68c8-2 16-2 24 2M68 46c8-4 16-4 24-2M68 58c8-4 16-4 24-2" />
          <path d="M86 6l14 14-30 30-16 4 4-16z" />
          <path d="M80 12l14 14" />
        </>
      ) : (
        <>
          {/* Bord met vork en mes */}
          <circle cx="60" cy="52" r="30" />
          <circle cx="60" cy="52" r="20" />
          <path d="M14 22v22c0 5 3 8 6 8v38M8 22v16M20 22v16" />
          <path d="M106 22c-8 6-10 18-10 30h10v38" />
        </>
      )}
    </svg>
  );
}

/** Merkkop: donker vlak met naam, ondertitel en lijntekening. Scrolt weg; de bediening eronder (BrandPanel) blijft plakken. */
export function BrandHeader({ title, sub, back, actions, art }: { title: ReactNode; sub?: ReactNode; back?: string; actions?: ReactNode; art: BrandArtName }) {
  return (
    <header className="brand">
      <BrandArt art={art} />
      {back !== undefined && (
        <button type="button" className="icon-btn brand-back" aria-label="Terug" onClick={() => goBack(back)}>
          <ChevronLeft size={24} />
        </button>
      )}
      <div className="brand-title">
        <h1>{title}</h1>
        {/* Altijd een ondertitelregel, zodat elke merkkop even hoog is. */}
        <p className="brand-sub">{sub ?? '\u00a0'}</p>
      </div>
      {actions && <div className="brand-actions">{actions}</div>}
    </header>
  );
}

/** Wit blok dat over de merkkop schuift; plakt bovenaan tijdens scrollen als het bediening bevat. */
export function BrandPanel({ children, sticky = false }: { children?: ReactNode; sticky?: boolean }) {
  return <div className={`brand-panel ${sticky ? 'sticky' : ''}`}>{children}</div>;
}

export function Sheet({ open, onClose, title, children, footer, labelledBy }: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  labelledBy?: string;
}) {
  useBackToClose(open, onClose);
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        ref={panel}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? (title ? id : undefined)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        {title && (
          <div className="sheet-head">
            <h2 id={id}>{title}</h2>
            <button type="button" className="icon-btn" aria-label="Sluiten" onClick={onClose}>
              <X size={22} />
            </button>
          </div>
        )}
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, text, confirmLabel, danger, onConfirm, onCancel }: {
  open: boolean;
  title: string;
  text: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <div className="row-2">
          <button type="button" className="btn" onClick={onCancel}>Annuleren</button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      }
    >
      <div className="confirm-text">{text}</div>
    </Sheet>
  );
}

export function Section({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`section ${className ?? ''}`}>
      {(title || action) && (
        <div className="section-head">
          {title && <h2>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <p className="empty-title">{title}</p>
      {text && <p className="empty-text">{text}</p>}
      {action}
    </div>
  );
}

export function Stars({ value, small }: { value: number; small?: boolean }) {
  if (!value) return null;
  return (
    <span className={`stars ${small ? 'stars-sm' : ''}`} aria-label={`${value} van 5 sterren`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} size={small ? 13 : 18} fill={i < value ? 'currentColor' : 'none'} strokeWidth={1.8} className={i < value ? 'on' : 'off'} />
      ))}
    </span>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ChipGroup<T extends string>({ value, options, onChange, label, extra }: {
  value: T | '';
  options: { value: T | ''; label: ReactNode; count?: number }[];
  onChange: (v: T | '') => void;
  label: string;
  /** Extra knop aan het eind van de rij, bijv. "meer tonen". */
  extra?: ReactNode;
}) {
  return (
    <div className="chips" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value || 'all'}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`chip ${value === o.value ? 'on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count !== undefined && <span className="chip-count">{o.count}</span>}
        </button>
      ))}
      {extra}
    </div>
  );
}

/** Tekstvak dat meegroeit met de inhoud. */
export function AutoText(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }) {
  const { minRows = 2, ...rest } = props;
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={minRows} {...rest} />;
}

