import type { CardBrand } from './types';
import { today } from './util';

/**
 * Card helpers shared by the add-card form and the mock server. The full number is validated and then
 * thrown away: only brand, last 4 digits and expiry are ever stored.
 * Test numbers: 4111 1111 1111 1111 (Visa, works), 4000 0000 0000 0002 (Visa, always declined at checkout).
 */
export const digitsOnly = (s: string) => s.replace(/\D/g, '');

export function luhn(num: string) {
  let sum = 0;
  let dbl = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = num.charCodeAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** A small, approximate subset of mada BIN prefixes: enough for a demo, not a real BIN table. */
const MADA = ['440647', '440795', '446404', '457865', '968208', '588845', '636120', '417633', '468540', '468541', '468542', '468543', '446672', '588846', '604906', '968201'];

export function brandOf(num: string): CardBrand | null {
  if (MADA.some((p) => num.startsWith(p))) return 'mada';
  if (/^4/.test(num)) return 'visa';
  if (/^(5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d\d|27[01]\d|2720)/.test(num)) return 'mastercard';
  return null;
}

/** `MM/YY` is valid and not in the past (a card is good through the last day of its month) */
export function checkExpiry(raw: string, now = today()): 'INVALID' | 'EXPIRED' | null {
  const m = /^(0[1-9]|1[0-2])\s*\/\s*(\d{2})$/.exec(raw.trim());
  if (!m) return 'INVALID';
  const ym = `20${m[2]}-${m[1]}`;
  return ym < now.slice(0, 7) ? 'EXPIRED' : null;
}

export type CardError = { number?: 'INVALID_LENGTH' | 'INVALID_LUHN' | 'UNSUPPORTED_BRAND'; expiry?: 'INVALID' | 'EXPIRED' };

export function validateCard(number: string, expiry: string, now = today()): { ok: true; brand: CardBrand; last4: string; expiry: string } | { ok: false; errors: CardError } {
  const n = digitsOnly(number);
  const errors: CardError = {};
  if (n.length < 13 || n.length > 19) errors.number = 'INVALID_LENGTH';
  else if (!luhn(n)) errors.number = 'INVALID_LUHN';
  const brand = errors.number ? null : brandOf(n);
  if (!errors.number && !brand) errors.number = 'UNSUPPORTED_BRAND';
  const e = checkExpiry(expiry, now);
  if (e) errors.expiry = e;
  if (errors.number || errors.expiry || !brand) return { ok: false, errors };
  return { ok: true, brand, last4: n.slice(-4), expiry: expiry.replace(/\s/g, '') };
}

export const isExpired = (expiry: string, now = today()) => checkExpiry(expiry, now) === 'EXPIRED';
/** the demo's failure trigger: any card whose number ends in 0002 is declined at checkout */
export const isDeclinedCard = (last4: string) => last4 === '0002';
