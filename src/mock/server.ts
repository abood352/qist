import { signMockToken } from '@pf/core/auth';
import { createDb, newId, type MockDb } from '@pf/core/db';
import { createMockServer, fail, paginate, q1, type MockRequest } from '@pf/core/mock';
import { invalidate } from '@pf/core/react/query';
import { isDeclinedCard, isExpired, validateCard } from '../api/cards';
import {
  applyRefund,
  decide,
  effectiveLimit,
  eligiblePlans,
  EMPLOYERS,
  INCOME_BANDS,
  isNationalId,
  MAX_ORDER,
  merchantFee,
  nextIncrease,
  outstanding,
  PLAN_TYPES,
  planStatus,
  resolvePayments,
  RETRY_DAYS,
  schedule,
  settleDate,
  type AccountLimit,
} from '../api/plans';
import type {
  Card,
  EligibilityBody,
  LimitInfo,
  MerchantOrder,
  MerchantStats,
  PayMethodRef,
  Plan,
  PlanType,
  ProductListItem,
  Quote,
  Settlement,
  Settlements,
  StoreRef,
  Upcoming,
  UpcomingItem,
  User,
} from '../api/types';
import { addDays, dateOf, diffDays, normalize, round2, today } from '../api/util';
import { demoAccounts, seed, SEED_VERSION, type Db, type DbCard, type DbOrder, type DbUser } from './seed';

/**
 * Qist's simulated backend, same conventions as the other apps: `fail(status, CODE, message, details)` for
 * errors, phone + one-time code (1234) for sign-in, `auth` role arrays per route.
 *
 * Stored vs derived: instalments are stored as paid / unpaid / refunded. `due` and `late` (and late fees,
 * the plan status, the limit in use) are derived on every read from today's date, never stored.
 *
 * Mock "time": instalments never collect by themselves. Autopay runs when the shopper opens the app:
 * `runAutopay()` is called by `GET /plans` and `GET /me/upcoming` and charges every instalment that is
 * `due` (not yet late) on plans with autopay and a saved card that is neither expired nor declined.
 * Late instalments are left for the shopper to pay by hand, so a late fee is never charged silently.
 *
 * The database is re-seeded when the day changes, so the demo accounts always have a due-soon and a late
 * instalment.
 */
let db: MockDb<Db>;

export async function createQistServer() {
  db = createDb<Db>('qist', SEED_VERSION, seed);
  if (db.data.seededOn !== today()) db.reset();
  db.onExternalChange(() => invalidate(''));
  return createMockServer(routes);
}

export function resetQistDb() {
  db?.reset();
}

export { demoAccounts };

const AUTH = { auth: true as const };
const SHOPPER = { auth: ['shopper'] as string[] };
const MERCHANT = { auth: ['merchant'] as string[] };
const MAX_CARDS = 5;

const nowIso = () => new Date().toISOString();
const userOf = (req: MockRequest) => db.data.users.find((u) => u.id === req.user!.sub) ?? fail(401, 'UNAUTHENTICATED', 'Gone');
const storeById = (id: string) => db.data.stores.find((s) => s.id === id) ?? fail(404, 'STORE_NOT_FOUND', 'No such store');
const storeRef = (id: string): StoreRef => {
  const { name, palette } = storeById(id);
  return { id, name, palette };
};
/** "Lama Al-Otaibi" → "Lama A." (stores see first name and initial only) */
const shortName = (name: string) => {
  const [first, ...rest] = name.trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
};
const publicCard = ({ userId: _u, ...c }: DbCard): Card => c;

/* ───────── plans ───────── */

function toPlan(o: DbOrder): Plan {
  const now = today();
  const payments = resolvePayments(o.payments, o.total, now);
  const unpaid = payments.filter((p) => p.status === 'due' || p.status === 'upcoming' || p.status === 'late');
  const status = planStatus(payments, o.total, o.refunded);
  const next = status === 'active' ? unpaid[0] : undefined;
  return {
    id: o.id,
    code: o.code,
    store: storeRef(o.storeId),
    items: o.items,
    total: o.total,
    planType: o.planType,
    payments,
    status,
    lateFees: round2(payments.reduce((a, p) => a + p.lateFee, 0)),
    refunded: o.refunded,
    createdAt: o.createdAt,
    paymentMethodId: o.paymentMethodId,
    autopay: o.autopay,
    paid: round2(payments.filter((p) => p.status === 'paid').reduce((a, p) => a + p.amount, 0)),
    remaining: round2(unpaid.reduce((a, p) => a + p.amount + p.lateFee, 0)),
    nextDue: next ? { n: next.n, dueDate: next.dueDate, amount: round2(next.amount + next.lateFee), daysUntil: diffDays(now, next.dueDate) } : null,
  };
}

const ownOrders = (userId: string) => db.data.orders.filter((o) => o.userId === userId);
const ownOrder = (userId: string, id: string) => ownOrders(userId).find((o) => o.id === id || o.code === id) ?? fail(404, 'PLAN_NOT_FOUND', 'No such plan');
const isActive = (o: DbOrder) => toPlan(o).status === 'active';

/* ───────── eligibility & limit ───────── */

/** a manual review that has run its course becomes an approval */
function settlePending(u: DbUser) {
  const e = u.eligibility;
  if (e.status === 'pending' && (e.decidesAt ?? 0) <= Date.now())
    db.commit(() => {
      e.status = 'approved';
      delete e.decidesAt;
    });
}

const onTimePlans = (userId: string) => ownOrders(userId).filter((o) => {
  const p = toPlan(o);
  return p.status === 'completed' && p.lateFees === 0;
}).length;

const usedBy = (userId: string) => round2(ownOrders(userId).filter(isActive).reduce((a, o) => a + outstanding(o.payments), 0));

function limitInfo(u: DbUser): LimitInfo {
  settlePending(u);
  const e = u.eligibility;
  const approved = e.status === 'approved';
  const onTime = onTimePlans(u.id);
  const limit = approved ? effectiveLimit(e.limit, onTime) : 0;
  const used = approved ? usedBy(u.id) : 0;
  return {
    status: e.status,
    limit,
    reason: e.reason,
    retryAfter: e.retryAfter,
    baseLimit: approved ? e.limit : 0,
    used,
    available: Math.max(0, round2(limit - used)),
    onTimePlans: onTime,
    nextIncrease: approved ? nextIncrease(e.limit, onTime) : null,
    decidesAt: e.status === 'pending' ? e.decidesAt : undefined,
  };
}

function acctOf(u: DbUser): AccountLimit {
  const i = limitInfo(u);
  return { status: i.status, limit: i.limit, used: i.used };
}

function publicUser(u: DbUser): User {
  const { eligibility: _e, ...rest } = u;
  const i = u.role === 'shopper' ? limitInfo(u) : null;
  return { ...rest, eligibility: i ? { status: i.status, limit: i.limit, reason: i.reason, retryAfter: i.retryAfter } : { status: 'none', limit: 0 } };
}

/* ───────── payment methods ───────── */

/** resolves a saved card id (or 'applepay') into what is stored on the payment; throws the matching API error */
function chargeMethod(u: DbUser, id: unknown): PayMethodRef {
  if (id === 'applepay') return { type: 'applepay' };
  if (typeof id !== 'string' || !id) return fail(422, 'VALIDATION', 'Choose a payment method', { paymentMethodId: 'REQUIRED' });
  const card = db.data.cards.find((c) => c.id === id && c.userId === u.id) ?? fail(404, 'CARD_NOT_FOUND', 'No such card');
  if (isExpired(card.expiry)) fail(422, 'CARD_EXPIRED', 'This card has expired', { paymentMethodId: 'EXPIRED' });
  if (isDeclinedCard(card.last4)) fail(402, 'CARD_DECLINED', 'The card was declined', { paymentMethodId: 'DECLINED' });
  return { type: card.brand, last4: card.last4 };
}

/** a card that can be charged without prompting (autopay): exists, not expired, not declined */
function usableCard(userId: string, id: string) {
  const c = db.data.cards.find((x) => x.id === id && x.userId === userId);
  return c && !isExpired(c.expiry) && !isDeclinedCard(c.last4) ? ({ type: c.brand, last4: c.last4 } as PayMethodRef) : null;
}

/** Charges due instalments on autopay plans (see the header comment for when this runs). */
function runAutopay(userId: string) {
  const now = today();
  for (const o of ownOrders(userId)) {
    if (!o.autopay) continue;
    const method = usableCard(userId, o.paymentMethodId);
    if (!method) continue;
    const resolved = resolvePayments(o.payments, o.total, now);
    const dueNow = resolved.filter((p) => p.status === 'due');
    if (!dueNow.length) continue;
    db.commit(() => {
      for (const p of dueNow) {
        const stored = o.payments.find((x) => x.n === p.n)!;
        stored.status = 'paid';
        stored.paidAt = nowIso();
        stored.method = method;
      }
    });
  }
}

/* ───────── merchant view ───────── */

function merchantView(o: DbOrder): MerchantOrder {
  const { paymentMethodId: _m, autopay: _a, nextDue: _n, ...plan } = toPlan(o);
  const value = round2(o.total - o.refunded);
  const fee = merchantFee(value);
  const settle = settleDate(dateOf(o.createdAt));
  return { ...plan, customer: o.customer, fee, net: round2(value - fee), settleDate: settle, settled: settle <= today() };
}

const storeOrders = (storeId: string) => db.data.orders.filter((o) => o.storeId === storeId);
const merchantStore = (req: MockRequest) => userOf(req).storeId ?? fail(403, 'FORBIDDEN', 'This account has no store');

/* ───────── routes ───────── */

const routes = {
  /* auth: phone + one-time code */
  'POST /auth/otp': ({ body }: MockRequest<{ phone: string }>) => {
    const phone = String(body?.phone ?? '').replace(/[\s-]/g, '').replace(/^(00966|966|\+966)/, '0');
    if (!/^05\d{8}$/.test(phone)) fail(422, 'VALIDATION', 'Saudi mobile required', { phone: 'INVALID' });
    const e164 = '+966' + phone.slice(1);
    const recent = db.data.otps.filter((o) => o.phone === e164 && o.expiresAt - 240_000 > Date.now());
    if (recent.length >= 3) fail(429, 'RATE_LIMITED', 'Too many codes requested, try again in a minute');
    const otp = { requestId: newId('otp_'), phone: e164, code: '1234', expiresAt: Date.now() + 300_000, attempts: 0 };
    db.commit((d) => {
      d.otps = d.otps.filter((o) => o.expiresAt > Date.now());
      d.otps.push(otp);
    });
    return { requestId: otp.requestId, expiresIn: 300, devCode: otp.code, isNew: !db.data.users.some((u) => u.phone === e164) };
  },
  'POST /auth/verify': ({ body }: MockRequest<{ requestId: string; code: string; name?: string }>) => {
    const otp = db.data.otps.find((o) => o.requestId === body?.requestId) ?? fail(404, 'OTP_NOT_FOUND', 'Request a new code');
    if (otp.expiresAt < Date.now()) fail(410, 'OTP_EXPIRED', 'Code expired');
    if (otp.attempts >= 5) fail(429, 'OTP_LOCKED', 'Too many attempts');
    if (otp.code !== String(body.code)) {
      db.commit(() => void otp.attempts++);
      fail(401, 'OTP_INVALID', 'Wrong code', { code: 'INVALID' });
    }
    let user = db.data.users.find((u) => u.phone === otp.phone);
    if (!user) {
      if (!body.name?.trim()) fail(422, 'VALIDATION', 'Name required for new accounts', { name: 'REQUIRED' });
      const u: DbUser = { id: newId('u-'), name: body.name!.trim(), phone: otp.phone, role: 'shopper', storeId: null, createdAt: nowIso(), eligibility: { status: 'none', limit: 0 } };
      db.commit((d) => void d.users.push(u));
      user = u;
    }
    db.commit((d) => void (d.otps = d.otps.filter((o) => o.requestId !== otp.requestId)));
    return { token: signMockToken({ sub: user.id, role: user.role, name: user.name }), user: publicUser(user) };
  },
  'GET /auth/me': [(req: MockRequest) => publicUser(userOf(req)), AUTH],
  'POST /auth/logout': [() => null, AUTH],

  /* stores & products */
  'GET /stores': ({ query }: MockRequest) => {
    const category = q1(query.category);
    return db.data.stores
      .filter((s) => !category || s.categories.includes(category as never))
      .map((s) => ({ ...s, products: db.data.products.filter((p) => p.storeId === s.id).length }));
  },
  'GET /stores/:id': ({ params }: MockRequest) => {
    const s = storeById(params.id);
    return { ...s, products: db.data.products.filter((p) => p.storeId === s.id) };
  },
  'GET /products': ({ query }: MockRequest) => {
    const store = q1(query.store);
    const tokens = normalize(q1(query.q) ?? '').split(' ').filter(Boolean);
    const items: ProductListItem[] = db.data.products
      .filter((p) => !store || p.storeId === store)
      .map((p) => ({ ...p, store: storeRef(p.storeId) }))
      .filter((p) => {
        if (!tokens.length) return true;
        const hay = normalize([p.title.ar, p.title.en, p.store.name.ar, p.store.name.en].join(' '));
        return tokens.every((t) => hay.includes(t));
      });
    const sort = q1(query.sort);
    if (sort === 'price_asc') items.sort((a, b) => a.price - b.price);
    else if (sort === 'price_desc') items.sort((a, b) => b.price - a.price);
    return paginate(items, query, 12);
  },

  /* spending limit */
  'GET /me/limit': [(req: MockRequest) => limitInfo(userOf(req)), SHOPPER],
  'POST /me/eligibility': [
    ({ body, user }: MockRequest<EligibilityBody>) => {
      const u = db.data.users.find((x) => x.id === user!.sub)!;
      const current = limitInfo(u);
      if (current.status === 'approved') fail(409, 'ALREADY_APPROVED', 'Your account is already verified');
      if (current.status === 'pending') fail(409, 'REVIEW_PENDING', 'Your review is still in progress');
      if (current.status === 'declined' && current.retryAfter && current.retryAfter > today()) fail(409, 'RETRY_LATER', 'You can apply again later', { retryAfter: current.retryAfter });
      const errors: Record<string, string> = {};
      if (!isNationalId(body?.nationalId)) errors.nationalId = 'INVALID';
      if (!INCOME_BANDS.includes(body?.incomeBand)) errors.incomeBand = 'INVALID';
      if (!EMPLOYERS.includes(body?.employer)) errors.employer = 'INVALID';
      if (Object.keys(errors).length) fail(422, 'VALIDATION', 'Check the highlighted fields', errors);
      // The id itself is never stored, only the outcome.
      const d = decide(body.nationalId, body.incomeBand, body.employer);
      db.commit(() => {
        u.eligibility = {
          status: d.status,
          limit: d.limit,
          score: d.score,
          reason: d.reason,
          retryAfter: d.status === 'declined' ? addDays(today(), RETRY_DAYS) : undefined,
          decidesAt: d.status === 'pending' ? Date.now() + 8000 : undefined,
        };
      });
      return limitInfo(u);
    },
    SHOPPER,
  ],

  /* quote & checkout */
  'POST /quote': [
    ({ body, user }: MockRequest<{ total: number }>) => {
      const total = Number(body?.total);
      if (!Number.isFinite(total) || total <= 0 || total > MAX_ORDER) fail(422, 'VALIDATION', 'Valid order total required', { total: 'INVALID' });
      const u = db.data.users.find((x) => x.id === user!.sub)!;
      const info = limitInfo(u);
      const t = round2(total);
      const q: Quote = {
        total: t,
        status: info.status,
        limit: info.limit,
        available: info.available,
        options: eligiblePlans(t, { status: info.status, limit: info.limit, used: info.used }).map((o) => ({ ...o, payments: schedule(o.plan, t, today()) })),
      };
      return q;
    },
    SHOPPER,
  ],
  'POST /checkout': [
    ({ body, user }: MockRequest<{ storeId: string; items: { productId: string; qty: number }[]; planType: PlanType; paymentMethodId: string }>) => {
      const u = db.data.users.find((x) => x.id === user!.sub)!;
      const store = storeById(String(body?.storeId));
      if (!Array.isArray(body?.items) || !body.items.length || body.items.length > 10) fail(422, 'VALIDATION', 'Add at least one item', { items: 'REQUIRED' });
      const items = body.items.map((i) => {
        const p = db.data.products.find((x) => x.id === i?.productId && x.storeId === store.id) ?? fail(422, 'VALIDATION', 'Unknown product', { items: 'INVALID' });
        if (!Number.isInteger(i.qty) || i.qty < 1 || i.qty > 10) fail(422, 'VALIDATION', 'Quantity must be 1-10', { items: 'INVALID' });
        return { title: p.title, price: p.price, qty: i.qty };
      });
      const total = round2(items.reduce((a, i) => a + i.price * i.qty, 0));
      if (total > MAX_ORDER) fail(422, 'VALIDATION', 'Order is too large', { items: 'TOO_LARGE' });
      if (!PLAN_TYPES.includes(body.planType)) fail(422, 'VALIDATION', 'Choose a plan', { planType: 'INVALID' });
      const option = eligiblePlans(total, acctOf(u)).find((o) => o.plan === body.planType)!;
      if (option.reason === 'NOT_APPROVED') fail(403, 'NOT_APPROVED', 'Verify your identity to use Qist', { status: u.eligibility.status });
      if (option.reason === 'LIMIT_EXCEEDED') fail(409, 'LIMIT_EXCEEDED', 'This order is above your available limit', { available: String(limitInfo(u).available) });
      if (option.reason) fail(422, 'PLAN_NOT_ALLOWED', 'This plan is not available for this order', { planType: option.reason });
      const method = chargeMethod(u, body.paymentMethodId); // 402 CARD_DECLINED etc. before anything is stored
      const now = today();
      const payments = schedule(body.planType, total, now).map((p) => (p.n === 1 && option.firstPayment > 0 ? { ...p, status: 'paid' as const, paidAt: nowIso(), method } : { ...p, status: 'upcoming' as const }));
      let created!: DbOrder;
      db.commit((d) => {
        created = {
          id: newId('o-'),
          code: `QS-${++d.seq}`,
          storeId: store.id,
          userId: u.id,
          customer: shortName(u.name),
          items,
          total,
          planType: body.planType,
          payments,
          refunded: 0,
          createdAt: nowIso(),
          paymentMethodId: body.paymentMethodId,
          autopay: method.type !== 'applepay',
        };
        d.orders.push(created);
      });
      return toPlan(created);
    },
    SHOPPER,
  ],

  /* my plans */
  'GET /plans': [
    ({ query, user }: MockRequest) => {
      runAutopay(user!.sub);
      const status = q1(query.status);
      return ownOrders(user!.sub)
        .map(toPlan)
        .filter((p) => !status || (status === 'late' ? p.payments.some((x) => x.status === 'late') : p.status === status))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    SHOPPER,
  ],
  'GET /plans/:id': [({ params, user }: MockRequest) => toPlan(ownOrder(user!.sub, params.id)), SHOPPER],
  'PATCH /plans/:id': [
    ({ params, body, user }: MockRequest<{ autopay?: boolean; paymentMethodId?: string }>) => {
      const u = db.data.users.find((x) => x.id === user!.sub)!;
      const o = ownOrder(u.id, params.id);
      const methodId = body?.paymentMethodId ?? o.paymentMethodId;
      if (body?.paymentMethodId !== undefined && body.paymentMethodId !== 'applepay' && !db.data.cards.some((c) => c.id === body.paymentMethodId && c.userId === u.id)) fail(404, 'CARD_NOT_FOUND', 'No such card');
      const autopay = body?.autopay ?? o.autopay;
      if (autopay && !db.data.cards.some((c) => c.id === methodId && c.userId === u.id)) fail(422, 'VALIDATION', 'Autopay needs a saved card', { autopay: 'NEEDS_CARD' });
      db.commit(() => {
        o.autopay = autopay;
        o.paymentMethodId = methodId;
      });
      return toPlan(o);
    },
    SHOPPER,
  ],
  'POST /plans/:id/payments/:n/pay': [
    ({ params, body, user }: MockRequest<{ paymentMethodId?: string }>) => {
      const u = db.data.users.find((x) => x.id === user!.sub)!;
      const o = ownOrder(u.id, params.id);
      const n = Number(params.n);
      const stored = o.payments.find((p) => p.n === n) ?? fail(404, 'PAYMENT_NOT_FOUND', 'No such instalment');
      if (stored.status !== 'upcoming') fail(409, 'ALREADY_PAID', 'This instalment is already settled');
      if (o.payments.some((p) => p.n < n && p.status === 'upcoming')) fail(409, 'PAY_IN_ORDER', 'Pay the earlier instalment first');
      const method = chargeMethod(u, body?.paymentMethodId ?? o.paymentMethodId);
      const lateFee = resolvePayments(o.payments, o.total).find((p) => p.n === n)!.lateFee;
      db.commit(() => {
        stored.status = 'paid';
        stored.paidAt = nowIso();
        stored.method = method;
        if (lateFee) stored.lateFee = lateFee;
      });
      return toPlan(o);
    },
    SHOPPER,
  ],
  /** Early repayment: pay everything that is left now. Interest-free, so the total never changes. */
  'POST /plans/:id/settle': [
    ({ params, body, user }: MockRequest<{ paymentMethodId?: string }>) => {
      const u = db.data.users.find((x) => x.id === user!.sub)!;
      const o = ownOrder(u.id, params.id);
      if (!o.payments.some((p) => p.status === 'upcoming')) fail(409, 'NOTHING_TO_SETTLE', 'This plan has no payments left');
      const method = chargeMethod(u, body?.paymentMethodId ?? o.paymentMethodId);
      const resolved = resolvePayments(o.payments, o.total);
      db.commit(() => {
        for (const p of o.payments) {
          if (p.status !== 'upcoming') continue;
          p.status = 'paid';
          p.paidAt = nowIso();
          p.method = method;
          const fee = resolved.find((x) => x.n === p.n)!.lateFee;
          if (fee) p.lateFee = fee;
        }
      });
      return toPlan(o);
    },
    SHOPPER,
  ],
  'GET /me/upcoming': [
    ({ user }: MockRequest): Upcoming => {
      runAutopay(user!.sub);
      const now = today();
      const until = addDays(now, 30);
      const overdue: UpcomingItem[] = [];
      const byDate = new Map<string, UpcomingItem[]>();
      for (const o of ownOrders(user!.sub)) {
        const plan = toPlan(o);
        for (const p of plan.payments) {
          if (p.status !== 'due' && p.status !== 'late' && p.status !== 'upcoming') continue;
          const item: UpcomingItem = { planId: o.id, code: o.code, store: plan.store, n: p.n, of: plan.payments.length, dueDate: p.dueDate, amount: round2(p.amount + p.lateFee), lateFee: p.lateFee, status: p.status, autopay: o.autopay };
          if (p.status !== 'upcoming') overdue.push(item);
          else if (p.dueDate <= until) byDate.set(p.dueDate, [...(byDate.get(p.dueDate) ?? []), item]);
        }
      }
      overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      const groups = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => ({ date, items, total: round2(items.reduce((a, i) => a + i.amount, 0)) }));
      return { overdue, groups, total: round2(overdue.reduce((a, i) => a + i.amount, 0) + groups.reduce((a, g) => a + g.total, 0)) };
    },
    SHOPPER,
  ],

  /* saved cards: the full number is validated and dropped, only brand + last 4 + expiry are kept */
  'GET /me/cards': [({ user }: MockRequest) => db.data.cards.filter((c) => c.userId === user!.sub).map(publicCard).sort((a, b) => Number(b.default) - Number(a.default)), SHOPPER],
  'POST /me/cards': [
    ({ body, user }: MockRequest<{ number: string; expiry: string }>) => {
      const v = validateCard(String(body?.number ?? ''), String(body?.expiry ?? ''));
      if (!v.ok) return fail(422, 'VALIDATION', 'Check the card details', v.errors as Record<string, string>);
      const mine = db.data.cards.filter((c) => c.userId === user!.sub);
      if (mine.length >= MAX_CARDS) fail(409, 'CARD_LIMIT', `You can save up to ${MAX_CARDS} cards`);
      if (mine.some((c) => c.last4 === v.last4 && c.brand === v.brand && c.expiry === v.expiry)) fail(409, 'CARD_EXISTS', 'This card is already saved');
      const card: DbCard = { id: newId('c-'), userId: user!.sub, brand: v.brand, last4: v.last4, expiry: v.expiry, default: mine.length === 0 };
      db.commit((d) => void d.cards.push(card));
      return publicCard(card);
    },
    SHOPPER,
  ],
  'DELETE /me/cards/:id': [
    ({ params, user }: MockRequest) => {
      const card = db.data.cards.find((c) => c.id === params.id && c.userId === user!.sub) ?? fail(404, 'CARD_NOT_FOUND', 'No such card');
      if (ownOrders(user!.sub).some((o) => o.autopay && o.paymentMethodId === card.id && isActive(o))) fail(409, 'CARD_IN_USE', 'Autopay is on for a plan using this card');
      db.commit((d) => {
        d.cards = d.cards.filter((c) => c.id !== card.id);
        const mine = d.cards.filter((c) => c.userId === user!.sub);
        if (card.default && mine.length) mine[0].default = true;
        // plans that used this card fall back to the new default (or Apple Pay) for manual payments
        for (const o of d.orders) if (o.userId === user!.sub && o.paymentMethodId === card.id) o.paymentMethodId = mine.find((c) => c.default)?.id ?? 'applepay';
      });
      return null;
    },
    SHOPPER,
  ],
  'PUT /me/cards/:id/default': [
    ({ params, user }: MockRequest) => {
      const card = db.data.cards.find((c) => c.id === params.id && c.userId === user!.sub) ?? fail(404, 'CARD_NOT_FOUND', 'No such card');
      db.commit((d) => {
        for (const c of d.cards) if (c.userId === user!.sub) c.default = c.id === card.id;
      });
      return publicCard(card);
    },
    SHOPPER,
  ],

  /* merchant */
  'GET /merchant/stats': [
    (req: MockRequest): MerchantStats => {
      const storeId = merchantStore(req);
      const now = today();
      const from = addDays(now, -29);
      const mine = storeOrders(storeId).map(merchantView);
      const recent = mine.filter((o) => dateOf(o.createdAt) >= from);
      const value = (o: MerchantOrder) => round2(o.total - o.refunded);
      const sales = round2(recent.reduce((a, o) => a + value(o), 0));
      const todays = recent.filter((o) => dateOf(o.createdAt) === now);
      const pending = mine.filter((o) => !o.settled);
      return {
        store: storeRef(storeId),
        sales,
        salesToday: round2(todays.reduce((a, o) => a + value(o), 0)),
        orders: recent.length,
        ordersToday: todays.length,
        avgOrderValue: recent.length ? round2(sales / recent.length) : 0,
        // a demo figure, not measured
        conversionUplift: 18 + (recent.length % 9),
        pendingSettlement: round2(pending.reduce((a, o) => a + o.net, 0)),
        nextSettlement: pending.map((o) => o.settleDate).sort()[0] ?? null,
        series: Array.from({ length: 30 }, (_, i) => {
          const date = addDays(from, i);
          return { date, sales: round2(recent.filter((o) => dateOf(o.createdAt) === date).reduce((a, o) => a + value(o), 0)) };
        }),
        planMix: PLAN_TYPES.map((plan) => ({ plan, orders: recent.filter((o) => o.planType === plan).length })),
      };
    },
    MERCHANT,
  ],
  'GET /merchant/orders': [
    (req: MockRequest) => {
      const storeId = merchantStore(req);
      const status = q1(req.query.status);
      const needle = normalize(q1(req.query.q) ?? '');
      const list = storeOrders(storeId)
        .map(merchantView)
        .filter((o) => !status || (status === 'late' ? o.payments.some((p) => p.status === 'late') : o.status === status))
        .filter((o) => !needle || normalize(o.code).includes(needle) || normalize(o.customer).includes(needle))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return paginate(list, req.query, 10);
    },
    MERCHANT,
  ],
  'GET /merchant/orders/:id': [
    (req: MockRequest) => {
      const storeId = merchantStore(req);
      const o = storeOrders(storeId).find((x) => x.id === req.params.id || x.code === req.params.id) ?? fail(404, 'ORDER_NOT_FOUND', 'No such order');
      return merchantView(o);
    },
    MERCHANT,
  ],
  /** Partial or full refund: future instalments shrink proportionally, any rest goes back on paid ones. */
  'POST /merchant/orders/:id/refund': [
    (req: MockRequest<{ amount: number }>) => {
      const storeId = merchantStore(req);
      const o = storeOrders(storeId).find((x) => x.id === req.params.id || x.code === req.params.id) ?? fail(404, 'ORDER_NOT_FOUND', 'No such order');
      const left = round2(o.total - o.refunded);
      if (left <= 0) fail(409, 'ALREADY_REFUNDED', 'This order is already fully refunded');
      const amount = round2(Number(req.body?.amount));
      if (!Number.isFinite(amount) || amount <= 0) fail(422, 'VALIDATION', 'Valid refund amount required', { amount: 'INVALID' });
      if (amount > left) fail(422, 'VALIDATION', 'Refund is more than what is left on the order', { amount: 'EXCEEDS_REMAINING' });
      db.commit(() => {
        o.payments = applyRefund(o.payments, amount);
        o.refunded = round2(o.refunded + amount);
      });
      return merchantView(o);
    },
    MERCHANT,
  ],
  /** T+2 working days (Sunday-Thursday week); each day's orders settle together. */
  'GET /merchant/settlements': [
    (req: MockRequest): Settlements => {
      const storeId = merchantStore(req);
      const now = today();
      const byDate = new Map<string, Settlement>();
      for (const o of storeOrders(storeId).map(merchantView)) {
        if (o.total - o.refunded <= 0) continue;
        const b = byDate.get(o.settleDate) ?? { date: o.settleDate, status: o.settleDate <= now ? 'paid' : 'pending', orders: 0, gross: 0, fee: 0, net: 0 };
        b.orders++;
        b.gross = round2(b.gross + o.total - o.refunded);
        b.fee = round2(b.fee + o.fee);
        b.net = round2(b.net + o.net);
        byDate.set(o.settleDate, b);
      }
      const batches = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
      const pend = batches.filter((b) => b.status === 'pending');
      return {
        pending: round2(pend.reduce((a, b) => a + b.net, 0)),
        paid: round2(batches.filter((b) => b.status === 'paid').reduce((a, b) => a + b.net, 0)),
        nextDate: pend.length ? pend[pend.length - 1].date : null,
        batches,
      };
    },
    MERCHANT,
  ],
} as const;
