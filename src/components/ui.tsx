import {
  Backpack, BedDouble, BookOpen, ChevronLeft, Disc3, Gamepad2, Gift, Inbox, Link2, Shirt, Sprout, Star, UtensilsCrossed, Wrench, X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { typeDef, type IconName } from '../data/itemTypes';
import type { TypeKey } from '../data/model';
import { goBack, useBackToClose } from '../ui/router';

const ICONS: Record<IconName, LucideIcon> = { Gift, BedDouble, UtensilsCrossed, BookOpen, Disc3, Shirt, Gamepad2, Backpack, Wrench, Sprout };

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

