import { amount, sar } from '@pf/core/format';
import type { ApiError } from '@pf/core/http';
import { useI18n } from '@pf/core/react/i18n';
import { invalidate } from '@pf/core/react/query';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { api } from '../api/services';
import { brandOf, digitsOnly, validateCard } from '../api/cards';
import type { Card, CardBrand, Payment, PaymentStatus, PayMethodRef, Store, StoreCategory, StoreRef } from '../api/types';
import { useMountedFlag } from '../lib/hooks';
import { errText } from '../lib/fmt';
import { Icon } from './Icon';
import { Badge, Button, Field } from './ui';
import q from './qist.module.css';

/* ───────── brand mark ───────── */

/** The Qist mark: a coin ring split into four instalment arcs (the first one lime = "paid today"). */
export function QistMark({ size = 38, animate }: { size?: number; animate?: boolean }) {
  const arc = (i: number, stroke: string, op: number) => (
    <circle
      key={i}
      cx="20"
      cy="20"
      r="10"
      stroke={stroke}
      strokeOpacity={op}
      strokeDasharray="11.5 51.3"
      strokeDashoffset={-15.7 * i}
      transform="rotate(-90 20 20)"
      className={animate ? q.markArc : undefined}
      style={animate ? { animationDelay: `${i * 220}ms` } : undefined}
    />
  );
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <rect width="40" height="40" rx="12" fill="var(--accent)" />
      <g fill="none" strokeWidth="4.4" strokeLinecap="round">
        {arc(0, 'var(--lime)', 1)}
        {arc(1, '#fff', 0.9)}
        {arc(2, '#fff', 0.55)}
        {arc(3, '#fff', 0.3)}
      </g>
    </svg>
  );
}

/* ───────── store logo & product art ───────── */

export function inkOn(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.24 ? '#10231c' : '#ffffff';
}

/** SVG monogram tile in the store's brand colours (no photos). */
export function StoreLogo({ store, size = 44 }: { store: Pick<Store | StoreRef, 'name' | 'palette'>; size?: number }) {
  const { lang } = useI18n();
  const [c1, c2] = store.palette;
  const letter = [...store.name[lang].replace(/^(ال|The\s+)/i, '')][0] ?? '?';
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={q.logo} aria-hidden="true">
      <rect width="48" height="48" rx="14" fill={c1} />
      <circle cx="40" cy="8" r="14" fill={c2} opacity=".55" />
      <circle cx="6" cy="46" r="10" fill={c2} opacity=".3" />
      <text x="24" y="32" textAnchor="middle" fontSize="24" fontWeight="700" fill={inkOn(c1)} fontFamily="Tajawal, system-ui, sans-serif">
        {letter.toUpperCase()}
      </text>
    </svg>
  );
}

const GLYPH: Record<StoreCategory, ReactNode> = {
  fashion: <path d="M60 22a6 6 0 1 1 6 6l-6 4 36 24a4 4 0 0 1-2 7H26a4 4 0 0 1-2-7l36-24" />,
  electronics: (
    <>
      <rect x="40" y="14" width="40" height="62" rx="8" />
      <circle cx="60" cy="66" r="3" fill="var(--art-bg)" stroke="none" />
    </>
  ),
  home: (
    <>
      <path d="M46 70h28l-4-26H50z" />
      <path d="M60 44V24M46 24h28" />
    </>
  ),
  beauty: (
    <>
      <rect x="44" y="34" width="32" height="42" rx="8" />
      <rect x="52" y="18" width="16" height="16" rx="4" />
    </>
  ),
  kids: (
    <>
      <rect x="34" y="50" width="26" height="26" rx="5" />
      <rect x="62" y="50" width="26" height="26" rx="5" />
      <rect x="48" y="22" width="26" height="26" rx="5" />
    </>
  ),
  travel: (
    <>
      <rect x="32" y="30" width="56" height="44" rx="8" />
      <path d="M50 30v-8h20v8M32 50h56" />
    </>
  ),
};

/** A tiny procedural illustration per category, tinted by the product palette. */
export function ProductArt({ category, palette, className = '' }: { category: StoreCategory; palette: [string, string]; className?: string }) {
  return (
    <svg viewBox="0 0 120 90" className={`${q.art} ${className}`} aria-hidden="true" preserveAspectRatio="xMidYMid slice" style={{ ['--art-bg' as string]: palette[0] }}>
      <rect width="120" height="90" fill={palette[0]} />
      <circle cx="98" cy="18" r="34" fill={palette[1]} opacity=".45" />
      <g fill={palette[1]} stroke="rgb(16 35 28 / .55)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
        {GLYPH[category]}
      </g>
    </svg>
  );
}

/* ───────── status ───────── */

const TONE: Record<PaymentStatus, 'green' | 'warn' | 'danger' | 'neutral' | 'accent'> = { paid: 'green', due: 'warn', late: 'danger', upcoming: 'neutral', refunded: 'accent' };
export function StatusChip({ status }: { status: PaymentStatus }) {
  const { t } = useI18n();
  return <Badge tone={TONE[status]}>{t(`status.${status}`)}</Badge>;
}

/** Instalment segments: paid filled, due amber, late coral, upcoming empty. */
export function SegBar({ payments, label }: { payments: Pick<Payment, 'status'>[]; label?: string }) {
  const { t } = useI18n();
  return (
    <span className={q.seg} role={label ? 'group' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {payments.map((p, i) => (
        <i key={i} className={q['seg_' + p.status]} role="img" aria-label={`${i + 1}: ${t('status.' + p.status)}`} style={{ animationDelay: `${i * 90}ms` }} />
      ))}
    </span>
  );
}

/* ───────── limit ring ───────── */

export function LimitRing({ used, limit, size = 132, children }: { used: number; limit: number; size?: number; children?: ReactNode }) {
  const on = useMountedFlag();
  const r = 52;
  const c = 2 * Math.PI * r;
  const frac = limit > 0 ? Math.min(1, used / limit) : 0;
  return (
    <div className={q.ring} style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--lime-soft)" strokeWidth="12" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--accent)" strokeWidth="12" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={on ? c * (1 - frac) : c} transform="rotate(-90 60 60)" className={q.ringFill} />
      </svg>
      <div className={q.ringIn}>{children}</div>
    </div>
  );
}

/* ───────── payment method pieces ───────── */

export const BRAND_LABEL: Record<CardBrand | 'applepay', string> = { mada: 'mada', visa: 'VISA', mastercard: 'Mastercard', applepay: 'Apple Pay' };

export function BrandTag({ brand }: { brand: CardBrand | 'applepay' }) {
  return <span className={`${q.brand} ${q['brand_' + brand]} ltr`}>{BRAND_LABEL[brand]}</span>;
}

export function MethodLabel({ method }: { method?: PayMethodRef }) {
  const { t } = useI18n();
  if (!method) return <>{t('pay.method.none')}</>;
  return (
    <span className={q.methodLabel}>
      <BrandTag brand={method.type} />
      {method.last4 && <span className="num ltr">•••• {method.last4}</span>}
    </span>
  );
}

/** Radiogroup of saved cards (+ Apple Pay, + "new card"). `value` is a card id, 'applepay' or 'new'. */
export function MethodPicker({ cards, value, onChange, applePay = true, allowNew = true, legend }: { cards: Card[]; value: string | null; onChange: (v: string) => void; applePay?: boolean; allowNew?: boolean; legend: string }) {
  const { t } = useI18n();
  const name = useId();
  const opt = (id: string, body: ReactNode, extra?: string) => (
    <label key={id} className={`${q.opt} ${value === id ? q.optOn : ''}`}>
      <input type="radio" name={name} checked={value === id} onChange={() => onChange(id)} />
      <span className={q.optBody}>{body}</span>
      {extra && <small>{extra}</small>}
      <span className={q.optDot} aria-hidden="true" />
    </label>
  );
  return (
    <fieldset className={q.methods} role="radiogroup">
      <legend>{legend}</legend>
      {cards.map((c) =>
        opt(
          c.id,
          <>
            <BrandTag brand={c.brand} />
            <b className="num ltr">•••• {c.last4}</b>
            <span className={`${q.exp} num`}>{c.expiry}</span>
          </>,
          c.default ? t('wallet.default') : undefined,
        ),
      )}
      {applePay && opt('applepay', <BrandTag brand="applepay" />)}
      {allowNew &&
        opt(
          'new',
          <>
            <Icon name="plus" size={16} /> {t('pay.newCard')}
          </>,
        )}
    </fieldset>
  );
}

/** Live-validated card form: brand, Luhn and expiry are checked as you type. The number is never stored. */
export function CardForm({ onAdded, onCancel, autoFocus }: { onAdded: (c: Card) => void; onCancel?: () => void; autoFocus?: boolean }) {
  const { t } = useI18n();
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [touched, setTouched] = useState({ number: false, expiry: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const digits = digitsOnly(number);
  const brand = digits.length >= 4 ? brandOf(digits) : null;
  const v = validateCard(number, expiry);
  const errors = v.ok ? {} : v.errors;
  const numErr = touched.number || digits.length >= 13 ? errors.number : undefined;
  const expErr = touched.expiry || expiry.length === 5 ? errors.expiry : undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched({ number: true, expiry: true });
    if (!v.ok) return;
    setBusy(true);
    setError('');
    try {
      const card = await api.me.addCard({ number: digits, expiry });
      invalidate('cards');
      onAdded(card);
    } catch (err) {
      setError((err as ApiError).code === 'VALIDATION' ? t('card.err.check') : errText(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={q.cardForm} onSubmit={submit} noValidate>
      <Field
        label={t('card.number')}
        value={number}
        inputMode="numeric"
        autoComplete="cc-number"
        placeholder="1234 5678 9012 3456"
        dir="ltr"
        autoFocus={autoFocus}
        onBlur={() => setTouched((x) => ({ ...x, number: true }))}
        onChange={(e) => setNumber(digitsOnly(e.target.value).slice(0, 19).replace(/(.{4})/g, '$1 ').trim())}
        error={numErr ? t(`card.err.${numErr}`) : undefined}
        hint={brand ? t('card.detected', { brand: BRAND_LABEL[brand] }) : t('card.testHint')}
      />
      <Field
        label={t('card.expiry')}
        value={expiry}
        inputMode="numeric"
        autoComplete="cc-exp"
        placeholder="MM/YY"
        dir="ltr"
        onBlur={() => setTouched((x) => ({ ...x, expiry: true }))}
        onChange={(e) => {
          const d = digitsOnly(e.target.value).slice(0, 4);
          setExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
        }}
        error={expErr ? t(`card.err.${expErr}`) : undefined}
      />
      <p className={q.cardNote}>
        <Icon name="lock" size={14} /> {t('card.secure')}
      </p>
      {error && (
        <p className={q.formError} role="alert">
          {error}
        </p>
      )}
      <div className={q.cardActions}>
        <Button type="submit" loading={busy}>
          {t('card.add')}
        </Button>
        {onCancel && (
          <Button type="button" variant="quiet" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}

/* ───────── small shared pieces ───────── */

/** Mini timeline of instalments: dot, amount, date; the payment due today is highlighted. */
export function MiniTimeline({ items, dateOf, todayLabel }: { items: { n: number; dueDate: string; amount: number }[]; dateOf: (d: string) => string; todayLabel: (d: string) => string | null }) {
  const { lang } = useI18n();
  return (
    <ol className={q.mini} style={{ ['--cols' as string]: Math.min(items.length, 3) }}>
      {items.map((p) => {
        const tl = todayLabel(p.dueDate);
        return (
          <li key={p.n} className={tl ? q.miniToday : undefined}>
            <i aria-hidden="true" />
            <b className="num">{amount(p.amount, lang)}</b>
            <small>{tl ?? dateOf(p.dueDate)}</small>
          </li>
        );
      })}
    </ol>
  );
}

export function Meter({ value, max, tone = 'accent', label }: { value: number; max: number; tone?: 'accent' | 'warn'; label: string }) {
  const { lang } = useI18n();
  const on = useMountedFlag();
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={q.meter} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label} aria-valuetext={sar(value, lang)}>
      <i className={q['meter_' + tone]} style={{ width: on ? `${pct}%` : 0 }} />
    </div>
  );
}

/** The method that is effectively selected: the chosen one if still valid, else the default card, else "new". */
export function resolveMethod(cards: Card[] | undefined, chosen: string | null, applePay = true): string | null {
  if (!cards) return null;
  if (chosen && (chosen === 'new' || (applePay && chosen === 'applepay') || cards.some((c) => c.id === chosen))) return chosen;
  return cards.find((c) => c.default)?.id ?? cards[0]?.id ?? (applePay ? 'applepay' : 'new');
}

/** Method picker plus the inline new-card form (used in dialogs and the wallet). */
export function MethodSelect({ cards, value, onChange, legend, applePay = true }: { cards: Card[]; value: string | null; onChange: (v: string) => void; legend: string; applePay?: boolean }) {
  return (
    <>
      <MethodPicker cards={cards} value={value} onChange={onChange} legend={legend} applePay={applePay} allowNew={cards.length < 5} />
      {value === 'new' && <CardForm autoFocus onAdded={(c) => onChange(c.id)} onCancel={cards.length ? () => onChange(cards.find((x) => x.default)?.id ?? cards[0].id) : undefined} />}
    </>
  );
}
