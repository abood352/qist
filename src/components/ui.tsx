import { amount, sar } from '@pf/core/format';
import { useI18n } from '@pf/core/react/i18n';
import { dismiss, useToasts } from '@pf/core/react/toast';
import type { ApiError } from '@pf/core/http';
import { useEffect, useId, useRef, type ComponentPropsWithRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { Icon } from './Icon';
import s from './ui.module.css';

export { s as ui };

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  block,
  className = '',
  children,
  disabled,
  ...rest
}: ComponentPropsWithRef<'button'> & { variant?: 'primary' | 'ghost' | 'outline' | 'danger' | 'quiet'; size?: 'sm' | 'md' | 'lg'; loading?: boolean; block?: boolean }) {
  return (
    <button
      className={`${s.btn} ${s[variant]} ${s[size]} ${block ? s.block : ''} ${loading ? s.loading : ''} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      <span className={s.btnLabel}>{children}</span>
      {loading && <span className={s.spinner} aria-hidden="true" />}
    </button>
  );
}

/** SAR price. `compare` shows a struck-through original price. */
export function Money({ value, compare, size = 'md', className = '' }: { value: number; compare?: number | null; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const { lang, t } = useI18n();
  return (
    <span className={`${s.money} ${s['money_' + size]} ${className}`}>
      <span className="sr-only">{sar(value, lang) + (compare ? ` (${sar(compare, lang)})` : '')}</span>
      <span aria-hidden="true">
        <b className="num">{amount(value, lang)}</b> <small>{t('common.sar')}</small>
      </span>
      {compare ? (
        <del aria-hidden="true" className="num">
          {amount(compare, lang)}
        </del>
      ) : null}
    </span>
  );
}

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const { lang } = useI18n();
  return (
    <span className={s.stars} style={{ ['--w' as string]: `${(value / 5) * 100}%`, fontSize: size }} role="img" aria-label={lang === 'ar' ? `${value} من 5` : `${value} out of 5`}>
      <span aria-hidden="true">★★★★★</span>
      <span aria-hidden="true" className={s.starsFill}>
        ★★★★★
      </span>
    </span>
  );
}

export function Skeleton({ w = '100%', h = 14, r, className = '' }: { w?: number | string; h?: number | string; r?: number; className?: string }) {
  return <span className={`${s.skeleton} ${className}`} style={{ width: w, height: h, borderRadius: r }} aria-hidden="true" />;
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent' | 'green' | 'warn' | 'danger'; children: ReactNode }) {
  return <span className={`${s.badge} ${s['badge_' + tone]}`}>{children}</span>;
}

export function EmptyState({ art, title, body, action }: { art?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className={s.empty} role="status">
      {art && <div className={s.emptyArt}>{art}</div>}
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry, compact }: { error?: ApiError; onRetry?: () => void; compact?: boolean }) {
  const { t } = useI18n();
  return (
    <div className={`${s.error} ${compact ? s.errorCompact : ''}`} role="alert">
      <Icon name="cloud-off" size={compact ? 20 : 32} />
      <div>
        <h3>{t('error.title')}</h3>
        <p>{t('error.body')}</p>
        {error && (
          <code className="ltr">
            {error.status || '—'} · {error.code}
          </code>
        )}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <Icon name="refresh" size={16} /> {t('common.retry')}
        </Button>
      )}
    </div>
  );
}

export function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  const { t } = useI18n();
  if (pages <= 1) return null;
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1);
  return (
    <nav className={s.pager} aria-label={t('common.page', { n: page, total: pages })}>
      <button onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label={t('common.prev')}>
        <Icon name="chevron-start" size={18} />
      </button>
      {nums.map((n, i) => (
        <span key={n} className={s.pagerGroup}>
          {i > 0 && n - nums[i - 1] > 1 && <span className={s.pagerGap}>…</span>}
          <button aria-current={n === page ? 'page' : undefined} onClick={() => onPage(n)} className="num">
            {n}
          </button>
        </span>
      ))}
      <button onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label={t('common.next')}>
        <Icon name="chevron-end" size={18} />
      </button>
    </nav>
  );
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  suffix?: ReactNode;
}

export function Field({ label, error, hint, suffix, className = '', ...rest }: FieldProps) {
  const id = useId();
  return (
    <label className={`${s.field} ${error ? s.fieldError : ''} ${className}`} htmlFor={id}>
      <span className={s.fieldLabel}>{label}</span>
      <span className={s.inputWrap}>
        <input id={id} aria-invalid={!!error || undefined} aria-describedby={error || hint ? id + 'd' : undefined} {...rest} />
        {suffix}
      </span>
      {(error || hint) && (
        <span id={id + 'd'} className={error ? s.fieldMsgError : s.fieldMsg}>
          {error ?? hint}
        </span>
      )}
    </label>
  );
}

export function SelectField({ label, error, children, className = '', ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string }) {
  const id = useId();
  return (
    <label className={`${s.field} ${error ? s.fieldError : ''} ${className}`} htmlFor={id}>
      <span className={s.fieldLabel}>{label}</span>
      <span className={s.inputWrap}>
        <select id={id} {...rest}>
          {children}
        </select>
        <Icon name="chevron-down" size={16} className={s.selectIcon} />
      </span>
      {error && <span className={s.fieldMsgError}>{error}</span>}
    </label>
  );
}

export function Qty({ value, onChange, max = 10, small }: { value: number; onChange: (n: number) => void; max?: number; small?: boolean }) {
  const { t } = useI18n();
  return (
    <div className={`${s.qty} ${small ? s.qtySm : ''}`} role="group" aria-label={t('common.qty')}>
      <button onClick={() => onChange(value - 1)} aria-label="−" disabled={value <= (small ? 0 : 1)}>
        <Icon name="minus" size={14} />
      </button>
      <output className="num" aria-live="polite">
        {value}
      </output>
      <button onClick={() => onChange(value + 1)} aria-label="+" disabled={value >= max}>
        <Icon name="plus" size={14} />
      </button>
    </div>
  );
}

/** Native <dialog>: focus trap, Esc to close and inert background come from the browser. */
export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`${s.dialog} ${wide ? s.dialogWide : ''}`}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
    >
      {open && (
        <div className={s.dialogInner}>
          <header className={s.dialogHead}>
            <h2>{title}</h2>
            <button className={s.iconBtn} onClick={onClose} aria-label={t('common.close')}>
              <Icon name="x" size={20} />
            </button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Toaster() {
  const toasts = useToasts();
  return (
    <div className={s.toaster} role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`${s.toast} ${s['toast_' + t.tone]}`}>
          <Icon name={t.tone === 'err' ? 'alert' : t.tone === 'info' ? 'heart' : 'check'} size={18} />
          <span>{t.text}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Decorative Sadu band: alternating triangles, the store's signature divider. */
export function SaduBand({ className = '' }: { className?: string }) {
  return (
    <svg className={`${s.sadu} ${className}`} viewBox="0 0 240 16" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <pattern id="sadu-p" width="24" height="16" patternUnits="userSpaceOnUse">
          <rect width="24" height="16" fill="var(--accent)" />
          <path d="M0 16 6 4l6 12zM12 0l6 12 6-12z" fill="var(--text)" />
          <rect y="7" width="24" height="2" fill="var(--bg)" opacity=".6" />
        </pattern>
      </defs>
      <rect width="240" height="16" fill="url(#sadu-p)" />
    </svg>
  );
}
