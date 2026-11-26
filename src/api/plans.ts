/**
 * Qist's money rules, pure and shared by the UI (previews) and the mock server (the API is the source of
 * truth in production). Everything here is a DEMO model: the numbers are approximate and inspired by, not
 * a statement of, Saudi regulation.
 *
 * - No interest, no shopper fee on the standard plans; the store pays the fee (see `merchantFee`).
 * - Instalments are split in halalas so the sum is exactly the total; the remainder goes in the first one.
 * - An instalment is `due` from its due date, still on time through 23:59 of the next day (grace), and
 *   `late` after that.
 * - Late fee: SAR 29 per late instalment, capped at 20% of the order total and at most 2 per plan
 *   (a demo rule inspired by SAMA's BNPL rules).
 * - Early repayment: any time, no penalty. It is interest-free, so the total never changes.
 * - Limit: set by the eligibility check, +500 SAR for every 3 plans completed with no late fee.
 */
import type { EligibilityStatus, EmployerType, IncomeBand, IneligibleReason, L, Payment, PlanStatus, PlanType, QuoteOption, StoredPayment } from './types';
import { addDays, addMonths, cents, round2, today, weekday } from './util';

export const PLAN_TYPES: PlanType[] = ['pay4', 'pay3', 'pay6', 'later30'];

export interface PlanDef {
  id: PlanType;
  /** number of payments */
  count: number;
  /** spacing between payments */
  every: { days: number } | { months: number };
  /** the first payment is taken at checkout */
  firstToday: boolean;
  /** minimum order total, SAR */
  min: number;
  /** maximum order total, SAR (null = bounded only by the limit) */
  max: number | null;
  /** counts the whole order against the limit instead of only what is left after the first payment */
  fullLimit: boolean;
  name: L;
  blurb: L;
}

export const PLANS: Record<PlanType, PlanDef> = {
  pay4: {
    id: 'pay4',
    count: 4,
    every: { days: 14 },
    firstToday: true,
    min: 40,
    max: null,
    fullLimit: false,
    name: { ar: 'على 4 دفعات', en: 'Pay in 4' },
    blurb: { ar: '4 دفعات متساوية كل أسبوعين، الأولى اليوم', en: '4 equal payments every 2 weeks, the first today' },
  },
  pay3: {
    id: 'pay3',
    count: 3,
    every: { months: 1 },
    firstToday: true,
    min: 90,
    max: null,
    fullLimit: false,
    name: { ar: 'على 3 أشهر', en: 'Pay in 3 months' },
    blurb: { ar: '3 دفعات شهرية متساوية، الأولى اليوم', en: '3 equal monthly payments, the first today' },
  },
  pay6: {
    id: 'pay6',
    count: 6,
    every: { months: 1 },
    firstToday: true,
    min: 500,
    max: null,
    fullLimit: true,
    name: { ar: 'على 6 أشهر', en: 'Pay in 6 months' },
    blurb: { ar: '6 دفعات شهرية للطلبات من 500 ر.س، تحتاج حدًا يغطي الطلب كاملًا', en: '6 monthly payments for orders from SAR 500; your available limit must cover the whole order' },
  },
  later30: {
    id: 'later30',
    count: 1,
    every: { days: 30 },
    firstToday: false,
    min: 40,
    max: 1500,
    fullLimit: true,
    name: { ar: 'ادفع بعد 30 يومًا', en: 'Pay in 30 days' },
    blurb: { ar: 'استلم الآن وادفع كامل المبلغ بعد 30 يومًا، للطلبات حتى 1,500 ر.س', en: 'Get it now and pay in full after 30 days, for orders up to SAR 1,500' },
  },
};

export const LATE_FEE = 29;
export const LATE_FEE_CAP_RATE = 0.2;
export const MAX_LATE_FEES = 2;
/** an instalment is late once today is after the day following its due date */
export const GRACE_DAYS = 1;
export const MAX_ORDER = 20_000;

/* ───────── schedule ───────── */

export function schedule(plan: PlanType, total: number, start: string): { n: number; dueDate: string; amount: number }[] {
  const def = PLANS[plan];
  const all = cents(total);
  const base = Math.floor(all / def.count);
  const remainder = all - base * def.count;
  return Array.from({ length: def.count }, (_, i) => ({
    n: i + 1,
    dueDate: !def.firstToday && def.count === 1 ? addDays(start, (def.every as { days: number }).days) : 'days' in def.every ? addDays(start, def.every.days * i) : addMonths(start, def.every.months * i),
    amount: (base + (i === 0 ? remainder : 0)) / 100,
  }));
}

/* ───────── late rules & derived statuses ───────── */

export const isLate = (dueDate: string, now = today()) => now > addDays(dueDate, GRACE_DAYS);

/** the late fee for the next late instalment, given the fees already applied on the plan */
export function lateFeeFor(total: number, applied: number[]): number {
  if (applied.length >= MAX_LATE_FEES) return 0;
  const room = round2(total * LATE_FEE_CAP_RATE) - applied.reduce((a, b) => a + b, 0);
  return round2(Math.max(0, Math.min(LATE_FEE, room)));
}

/** Derives `due` / `late` / late fees from stored instalments (paid ones keep the fee they were charged). */
export function resolvePayments(stored: StoredPayment[], total: number, now = today()): Payment[] {
  const fees: number[] = [];
  return stored.map((p) => {
    const base = { n: p.n, dueDate: p.dueDate, amount: p.amount, paidAt: p.paidAt, method: p.method, refunded: p.refunded ?? 0 };
    if (p.status === 'paid' || p.status === 'refunded') {
      const lateFee = p.lateFee ?? 0;
      if (lateFee) fees.push(lateFee);
      return { ...base, status: p.status, lateFee };
    }
    if (isLate(p.dueDate, now)) {
      const lateFee = lateFeeFor(total, fees);
      if (lateFee) fees.push(lateFee);
      return { ...base, status: 'late', lateFee };
    }
    return { ...base, status: p.dueDate <= now ? 'due' : 'upcoming', lateFee: 0 };
  });
}

export function planStatus(payments: Pick<Payment, 'status'>[], total: number, refunded: number): PlanStatus {
  if (refunded >= total - 0.005) return 'refunded';
  return payments.every((p) => p.status === 'paid' || p.status === 'refunded') ? 'completed' : 'active';
}

/** SAR of principal still to be paid on an instalment list (late fees excluded) */
export const outstanding = (payments: Pick<StoredPayment, 'status' | 'amount'>[]) => round2(payments.filter((p) => p.status === 'upcoming').reduce((a, p) => a + p.amount, 0));

/* ───────── eligibility for a purchase ───────── */

export interface AccountLimit {
  status: EligibilityStatus;
  limit: number;
  /** principal outstanding on active plans */
  used: number;
}

export function eligiblePlans(total: number, acct: AccountLimit): Omit<QuoteOption, 'payments'>[] {
  const available = Math.max(0, round2(acct.limit - acct.used));
  return PLAN_TYPES.map((id) => {
    const def = PLANS[id];
    const sched = schedule(id, total, today());
    const firstPayment = def.firstToday ? sched[0].amount : 0;
    const exposure = def.fullLimit ? total : round2(total - firstPayment);
    let reason: IneligibleReason | undefined;
    if (acct.status !== 'approved') reason = 'NOT_APPROVED';
    else if (total < def.min) reason = 'BELOW_MIN';
    else if (def.max !== null && total > def.max) reason = 'ABOVE_MAX';
    else if (exposure > available) reason = 'LIMIT_EXCEEDED';
    return { plan: id, eligible: !reason, reason, limitLeft: reason ? 0 : round2(available - exposure), firstPayment };
  });
}

/* ───────── spending limit ───────── */

export const LIMIT_TIERS = [0, 1500, 3000, 5000, 10000];
export const LIMIT_STEP = 500;
export const PLANS_PER_STEP = 3;
export const MAX_LIMIT = 10000;
export const RETRY_DAYS = 30;

export const INCOME_BANDS: IncomeBand[] = ['lt5k', '5k_10k', '10k_20k', 'gt20k'];
export const EMPLOYERS: EmployerType[] = ['government', 'private', 'self', 'retired', 'student', 'unemployed'];
const EMPLOYER_BONUS: Record<EmployerType, number> = { government: 10, private: 5, retired: 5, self: 0, student: -10, unemployed: -15 };

/** Saudi national / iqama number: 10 digits starting with 1 or 2 (no checksum is checked in the demo) */
export const isNationalId = (s: unknown): s is string => typeof s === 'string' && /^[12]\d{9}$/.test(s);

/** A stable pseudo credit score 0-100 from the national id and employer: the same person always gets the same answer. */
export function fakeScore(nationalId: string, employer: EmployerType) {
  let h = 2166136261;
  for (const ch of nationalId) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const base = 30 + (h % 61);
  return Math.max(0, Math.min(100, base + EMPLOYER_BONUS[employer]));
}

export interface Decision {
  status: 'approved' | 'declined' | 'pending';
  /** base limit; for `pending` the limit granted once the review ends */
  limit: number;
  score: number;
  reason?: 'LOW_SCORE';
}

/**
 * score < 40: declined (LOW_SCORE); 40-47: manual review, then a SAR 1,500 limit; otherwise the limit is the
 * tier of the income band, one tier lower when the score is below 55.
 */
export function decide(nationalId: string, incomeBand: IncomeBand, employer: EmployerType): Decision {
  const score = fakeScore(nationalId, employer);
  if (score < 40) return { status: 'declined', limit: 0, score, reason: 'LOW_SCORE' };
  if (score < 48) return { status: 'pending', limit: LIMIT_TIERS[1], score };
  const tier = INCOME_BANDS.indexOf(incomeBand) + 1;
  return { status: 'approved', limit: LIMIT_TIERS[Math.max(1, score < 55 ? tier - 1 : tier)], score };
}

/** base limit + 500 SAR for every 3 plans completed with no late fee, up to the top tier */
export function effectiveLimit(base: number, onTimePlans: number) {
  if (base <= 0) return 0;
  return Math.min(MAX_LIMIT, base + LIMIT_STEP * Math.floor(onTimePlans / PLANS_PER_STEP));
}

export function nextIncrease(base: number, onTimePlans: number) {
  const now = effectiveLimit(base, onTimePlans);
  if (base <= 0 || now >= MAX_LIMIT) return null;
  return { plansLeft: PLANS_PER_STEP - (onTimePlans % PLANS_PER_STEP), amount: LIMIT_STEP, newLimit: Math.min(MAX_LIMIT, now + LIMIT_STEP) };
}

/* ───────── merchant side ───────── */

export const MDR_RATE = 0.06;
export const MDR_FIXED = 1;
/** Qist fee on the net order value (demo MDR: 6% + SAR 1) */
export const merchantFee = (net: number) => (net > 0 ? round2(net * MDR_RATE + MDR_FIXED) : 0);

/** T+2 working days, Sunday to Thursday week (approximate; public holidays are ignored) */
export function settleDate(orderDate: string) {
  let d = orderDate;
  let left = 2;
  while (left > 0) {
    d = addDays(d, 1);
    if (weekday(d) <= 4) left--;
  }
  return d;
}

/**
 * Applies a store refund to the instalments. The unpaid instalments shrink proportionally first; whatever
 * is left goes back to the shopper against the latest paid instalments. Works in halalas so nothing drifts.
 */
export function applyRefund(payments: StoredPayment[], refund: number): StoredPayment[] {
  const out = payments.map((p) => ({ ...p }));
  const want = cents(refund);
  const unpaid = out.filter((p) => p.status === 'upcoming' && p.amount > 0);
  const U = unpaid.reduce((a, p) => a + cents(p.amount), 0);
  const fromFuture = Math.min(want, U);
  if (fromFuture > 0) {
    const reds = unpaid.map((p) => Math.floor((fromFuture * cents(p.amount)) / U));
    let rem = fromFuture - reds.reduce((a, b) => a + b, 0);
    for (let i = 0; rem > 0; i = (i + 1) % unpaid.length) {
      if (reds[i] < cents(unpaid[i].amount)) {
        reds[i]++;
        rem--;
      }
    }
    unpaid.forEach((p, i) => {
      const left = cents(p.amount) - reds[i];
      p.amount = left / 100;
      p.refunded = (cents(p.refunded ?? 0) + reds[i]) / 100;
      if (left === 0) p.status = 'refunded';
    });
  }
  let cash = want - fromFuture;
  for (const p of [...out].reverse()) {
    if (cash <= 0) break;
    if (p.status !== 'paid') continue;
    const take = Math.min(cash, cents(p.amount) - cents(p.refunded ?? 0));
    if (take <= 0) continue;
    p.refunded = (cents(p.refunded ?? 0) + take) / 100;
    if (cents(p.refunded) >= cents(p.amount)) p.status = 'refunded';
    cash -= take;
  }
  return out;
}
