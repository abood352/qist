/**
 * Saudi-market formatting. Latin digits are used in both languages (what Saudi apps
 * like Jahez, Salla and Tamara show), prices are in SAR, and dates can be shown in
 * Gregorian and Umm al-Qura Hijri.
 */
export type Lang = 'ar' | 'en';

const locale = (lang: Lang) => (lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-SA');

export function number(n: number, lang: Lang, digits = 0) {
  return new Intl.NumberFormat(locale(lang), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

/** Amount only (no currency); the UI adds the currency label. Halalas shown only when present. */
export function amount(n: number, lang: Lang) {
  const digits = Math.round(n * 100) % 100 === 0 ? 0 : 2;
  return number(n, lang, digits);
}

/** Plain-text money with currency (aria-labels, titles, CSV). */
export function sar(n: number, lang: Lang) {
  return lang === 'ar' ? `${amount(n, lang)} ر.س` : `SAR ${amount(n, lang)}`;
}

export function date(iso: string | number | Date, lang: Lang, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', opts).format(new Date(iso));
}

export function hijri(iso: string | number | Date, lang: Lang, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }) {
  return new Intl.DateTimeFormat(`${lang === 'ar' ? 'ar-SA' : 'en-SA'}-u-ca-islamic-umalqura-nu-latn`, opts).format(new Date(iso));
}

export function time(iso: string | number | Date, lang: Lang) {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

export function relative(iso: string | number | Date, lang: Lang) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en', { numeric: 'auto' });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 30],
    ['month', 12],
    ['year', Infinity],
  ];
  let value = diff;
  for (const [unit, size] of steps) {
    if (Math.abs(value) < size) return rtf.format(Math.round(value), unit);
    value /= size;
  }
  return '';
}

/** Saudi mobile: 05XXXXXXXX or +9665XXXXXXXX → normalized +9665XXXXXXXX, or null */
export function saudiMobile(input: string) {
  const digits = input.replace(/[\s-]/g, '').replace(/^(\+?966|00966)/, '0');
  return /^05\d{8}$/.test(digits) ? '+966' + digits.slice(1) : null;
}

/** National Address short code: 4 letters + 4 digits, e.g. RRRD2929 */
export const isShortAddress = (s: string) => /^[A-Z]{4}\d{4}$/.test(s.trim().toUpperCase());
