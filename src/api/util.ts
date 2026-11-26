/** Dates are local Saudi dates `YYYY-MM-DD` (Riyadh, UTC+3, no DST); money is SAR with at most 2 decimals. */
const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};
export const today = () => iso(new Date());
export const addDays = (s: string, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
/** adds calendar months, clamping the day (31 Jan + 1 month = 28/29 Feb) */
export const addMonths = (s: string, n: number) => {
  const [y, m, d] = s.split('-').map(Number);
  const last = new Date(y, m - 1 + n + 1, 0).getDate();
  return iso(new Date(y, m - 1 + n, Math.min(d, last), 12));
};
export const diffDays = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 864e5);
export const weekday = (s: string) => parse(s).getDay();
export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parse(s).getTime()) && iso(parse(s)) === s;
/** local date of an ISO timestamp */
export const dateOf = (timestamp: string) => iso(new Date(timestamp));

export const cents = (n: number) => Math.round(n * 100);
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** lower-case, no diacritics, unified alef / ya / ta marbuta: search is forgiving in Arabic */
export const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
