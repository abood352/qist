/**
 * Wire types: the JSON shapes the API returns (mock and real).
 * Dates are local Saudi dates `YYYY-MM-DD`; money is SAR (numbers with at most 2 decimals).
 */
import type { Localized } from '@pf/core/react/i18n';
export type { Page } from '@pf/core/http';

export type L = Localized;
export type PlanType = 'pay4' | 'pay3' | 'pay6' | 'later30';
export type PaymentStatus = 'paid' | 'due' | 'upcoming' | 'late' | 'refunded';
export type PlanStatus = 'active' | 'completed' | 'cancelled' | 'refunded';
export type EligibilityStatus = 'none' | 'pending' | 'approved' | 'declined';
export type IncomeBand = 'lt5k' | '5k_10k' | '10k_20k' | 'gt20k';
export type EmployerType = 'government' | 'private' | 'self' | 'retired' | 'student' | 'unemployed';
export type CardBrand = 'mada' | 'visa' | 'mastercard';
export type StoreCategory = 'fashion' | 'electronics' | 'home' | 'beauty' | 'kids' | 'travel';
export type IneligibleReason = 'NOT_APPROVED' | 'BELOW_MIN' | 'ABOVE_MAX' | 'LIMIT_EXCEEDED';
export type Role = 'shopper' | 'merchant';

export interface Eligibility {
  status: EligibilityStatus;
  /** effective limit in SAR (base limit + earned increases); 0 unless approved */
  limit: number;
  reason?: 'LOW_SCORE';
  /** declined users can re-apply from this date */
  retryAfter?: string;
}

export interface User {
  id: string;
  name: string;
  phone: string;
  role: Role;
  /** the store a merchant account manages */
  storeId: string | null;
  eligibility: Eligibility;
  createdAt: string;
}

/* ───────── stores & products ───────── */

export interface Store {
  id: string;
  name: L;
  tagline: L;
  categories: StoreCategory[];
  /** brand colours */
  palette: [string, string];
}
export type StoreRef = Pick<Store, 'id' | 'name' | 'palette'>;
export interface StoreSummary extends Store {
  products: number;
}

export interface Product {
  id: string;
  storeId: string;
  title: L;
  /** SAR */
  price: number;
  palette: [string, string];
}
export interface StoreDetail extends Store {
  products: Product[];
}

/* ───────── plans & payments ───────── */

export interface OrderItem {
  title: L;
  price: number;
  qty: number;
}

export interface PayMethodRef {
  type: CardBrand | 'applepay';
  last4?: string;
}

/** An instalment as stored; `due` / `late` are derived on read, never stored. */
export interface StoredPayment {
  n: number;
  dueDate: string;
  /** SAR still to pay (reduced by refunds before it is paid) */
  amount: number;
  status: 'paid' | 'upcoming' | 'refunded';
  paidAt?: string;
  method?: PayMethodRef;
  /** late fee charged with this instalment (set when it is paid late) */
  lateFee?: number;
  /** SAR credited back to the shopper against this instalment */
  refunded?: number;
}

export interface Payment {
  n: number;
  dueDate: string;
  amount: number;
  status: PaymentStatus;
  paidAt?: string;
  method?: PayMethodRef;
  /** late fee on this instalment (applied once it is late, 0 otherwise) */
  lateFee: number;
  refunded: number;
}

export interface Plan {
  id: string;
  /** QS-xxxxx */
  code: string;
  store: StoreRef;
  items: OrderItem[];
  total: number;
  planType: PlanType;
  payments: Payment[];
  status: PlanStatus;
  /** sum of late fees on this plan (paid or still owed) */
  lateFees: number;
  /** SAR refunded by the store so far */
  refunded: number;
  createdAt: string;
  /** a saved card id or 'applepay' */
  paymentMethodId: string;
  autopay: boolean;
  /** instalment amounts already paid */
  paid: number;
  /** still owed: unpaid instalments plus late fees due */
  remaining: number;
  nextDue: { n: number; dueDate: string; amount: number; daysUntil: number } | null;
}

/* ───────── limit, quote, checkout ───────── */

export interface LimitInfo extends Eligibility {
  /** the limit before earned increases */
  baseLimit: number;
  /** SAR of principal still outstanding on active plans */
  used: number;
  available: number;
  onTimePlans: number;
  nextIncrease: { plansLeft: number; amount: number; newLimit: number } | null;
  /** pending checks resolve at this epoch-ms time */
  decidesAt?: number;
}

export interface EligibilityBody {
  nationalId: string;
  incomeBand: IncomeBand;
  employer: EmployerType;
}

export interface QuoteOption {
  plan: PlanType;
  eligible: boolean;
  reason?: IneligibleReason;
  /** limit left after this purchase (0 when not eligible) */
  limitLeft: number;
  /** due today (0 for pay-later) */
  firstPayment: number;
  payments: { n: number; dueDate: string; amount: number }[];
}
export interface Quote {
  total: number;
  status: EligibilityStatus;
  limit: number;
  available: number;
  options: QuoteOption[];
}

export interface CheckoutBody {
  storeId: string;
  items: { productId: string; qty: number }[];
  planType: PlanType;
  /** a saved card id or 'applepay' */
  paymentMethodId: string;
}

export interface Card {
  id: string;
  brand: CardBrand;
  last4: string;
  /** MM/YY */
  expiry: string;
  default: boolean;
}

export interface UpcomingItem {
  planId: string;
  code: string;
  store: StoreRef;
  n: number;
  of: number;
  dueDate: string;
  /** instalment plus any late fee */
  amount: number;
  lateFee: number;
  status: 'due' | 'upcoming' | 'late';
  autopay: boolean;
}
export interface Upcoming {
  /** due or late right now */
  overdue: UpcomingItem[];
  /** the next 30 days, one group per date */
  groups: { date: string; total: number; items: UpcomingItem[] }[];
  /** everything payable in the next 30 days including overdue */
  total: number;
}

/* ───────── merchant ───────── */

export interface MerchantOrder extends Omit<Plan, 'paymentMethodId' | 'autopay' | 'nextDue'> {
  /** first name and initial only */
  customer: string;
  /** Qist fee (demo MDR): 6% + 1 SAR of the net order value */
  fee: number;
  /** what the store receives: net value minus fee */
  net: number;
  settleDate: string;
  settled: boolean;
}

export interface MerchantStats {
  store: StoreRef;
  /** last 30 days, net of refunds */
  sales: number;
  salesToday: number;
  orders: number;
  ordersToday: number;
  avgOrderValue: number;
  /** demo figure: extra conversion vs card-only checkout, in % */
  conversionUplift: number;
  pendingSettlement: number;
  nextSettlement: string | null;
  series: { date: string; sales: number }[];
  planMix: { plan: PlanType; orders: number }[];
}

export interface Settlement {
  date: string;
  status: 'paid' | 'pending';
  orders: number;
  gross: number;
  fee: number;
  net: number;
}
export interface Settlements {
  pending: number;
  paid: number;
  nextDate: string | null;
  batches: Settlement[];
}

export interface ProductListItem extends Product {
  store: StoreRef;
}
