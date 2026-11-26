import { date as fmtDate, hijri, type Lang } from '@pf/core/format';
import type { ApiError } from '@pf/core/http';
import { diffDays, parse, today } from '../api/util';
import type { StoreRef } from '../api/types';

export type T = (key: string, vars?: Record<string, string | number>) => string;

export const dateShort = (d: string, lang: Lang) => fmtDate(parse(d), lang, { day: 'numeric', month: 'short' });
export const dateMedium = (d: string, lang: Lang) => fmtDate(parse(d), lang, { weekday: 'short', day: 'numeric', month: 'short' });
export const dateLong = (d: string, lang: Lang) => fmtDate(parse(d), lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const dateFull = (d: string, lang: Lang) => fmtDate(parse(d), lang, { day: 'numeric', month: 'long', year: 'numeric' });
export const hijriShort = (d: string, lang: Lang) => hijri(parse(d), lang, { day: 'numeric', month: 'short', year: 'numeric' });
export const weekdayShort = (d: string, lang: Lang) => fmtDate(parse(d), lang, { weekday: 'short' });
export const dayNumber = (d: string, lang: Lang) => fmtDate(parse(d), lang, { day: 'numeric' });

/** "اليوم" / "غدًا" / "بعد 5 أيام" for near dates, the short date otherwise */
export function dayLabel(d: string, lang: Lang, t: T) {
  const n = diffDays(today(), d);
  if (n === 0) return t('day.today');
  if (n === 1) return t('day.tomorrow');
  return dateMedium(d, lang);
}

/** "اليوم" / "بعد 3 أيام" / "قبل يومين" */
export function relDays(d: string, t: T) {
  const n = diffDays(today(), d);
  if (n === 0) return t('day.today');
  if (n > 0) return t('rel.in', { n });
  return t('rel.ago', { n: -n });
}

/** localized text for an API error; unknown codes fall back to a generic message */
export function errText(e: unknown, t: T) {
  const code = (e as ApiError)?.code;
  const key = `err.${code}`;
  const msg = code ? t(key) : key;
  return msg === key ? t('error.generic') : msg;
}

export const storeName = (s: Pick<StoreRef, 'name'>, lang: Lang) => s.name[lang];

/** instalment amounts of the "pay in 4" teaser shown on product cards */
export const hasPay4 = (price: number) => price >= 40;

export const monthKey = (d: string) => d.slice(0, 7);

/** Sunday-first week start (the Saudi working week begins on Sunday) */
export function weekStart(d: string) {
  const p = parse(d);
  p.setDate(p.getDate() - p.getDay());
  const y = p.getFullYear();
  const m = String(p.getMonth() + 1).padStart(2, '0');
  const dd = String(p.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** "Satin dress + 1 more" */
export function planTitle(items: { title: { ar: string; en: string } }[], lang: Lang, t: T) {
  const first = items[0]?.title[lang] ?? '';
  return items.length > 1 ? `${first} ${t('plan.more', { n: items.length - 1 })}` : first;
}
