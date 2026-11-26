import { http, type Page, type Query } from '@pf/core/http';
import type {
  Card,
  CheckoutBody,
  EligibilityBody,
  LimitInfo,
  MerchantOrder,
  MerchantStats,
  Plan,
  PlanStatus,
  ProductListItem,
  Quote,
  Settlements,
  StoreCategory,
  StoreDetail,
  StoreSummary,
  Upcoming,
  User,
} from './types';

export interface ProductQuery {
  store?: string;
  q?: string;
  sort?: 'price_asc' | 'price_desc';
  page?: number;
  limit?: number;
}
export interface MerchantOrderQuery {
  status?: PlanStatus | 'late';
  q?: string;
  page?: number;
}

const toQuery = (q: ProductQuery | MerchantOrderQuery): Query => ({ ...q, q: q.q?.trim() || undefined });

/** The service layer: the only file that knows endpoint paths. */
export const api = {
  auth: {
    requestOtp: (phone: string) => http.post<{ requestId: string; expiresIn: number; devCode?: string; isNew: boolean }>('/auth/otp', { phone }),
    verify: (requestId: string, code: string, name?: string) => http.post<{ token: string; user: User }>('/auth/verify', { requestId, code, name }),
    me: () => http.get<User>('/auth/me'),
    logout: () => http.post<null>('/auth/logout'),
  },
  stores: {
    list: (category?: StoreCategory) => http.get<StoreSummary[]>('/stores', { category }),
    get: (id: string) => http.get<StoreDetail>(`/stores/${encodeURIComponent(id)}`),
    products: (q: ProductQuery) => http.get<Page<ProductListItem>>('/products', toQuery(q)),
  },
  me: {
    limit: () => http.get<LimitInfo>('/me/limit'),
    verifyIdentity: (body: EligibilityBody) => http.post<LimitInfo>('/me/eligibility', body),
    upcoming: () => http.get<Upcoming>('/me/upcoming'),
    cards: () => http.get<Card[]>('/me/cards'),
    addCard: (body: { number: string; expiry: string }) => http.post<Card>('/me/cards', body),
    removeCard: (id: string) => http.del<null>(`/me/cards/${id}`),
    setDefaultCard: (id: string) => http.put<Card>(`/me/cards/${id}/default`),
  },
  checkout: {
    quote: (total: number) => http.post<Quote>('/quote', { total }),
    create: (body: CheckoutBody) => http.post<Plan>('/checkout', body),
  },
  plans: {
    list: (status?: PlanStatus | 'late') => http.get<Plan[]>('/plans', { status }),
    get: (id: string) => http.get<Plan>(`/plans/${encodeURIComponent(id)}`),
    update: (id: string, body: { autopay?: boolean; paymentMethodId?: string }) => http.patch<Plan>(`/plans/${id}`, body),
    pay: (id: string, n: number, paymentMethodId?: string) => http.post<Plan>(`/plans/${id}/payments/${n}/pay`, { paymentMethodId }),
    settle: (id: string, paymentMethodId?: string) => http.post<Plan>(`/plans/${id}/settle`, { paymentMethodId }),
  },
  merchant: {
    stats: () => http.get<MerchantStats>('/merchant/stats'),
    orders: (q: MerchantOrderQuery) => http.get<Page<MerchantOrder>>('/merchant/orders', toQuery(q)),
    order: (id: string) => http.get<MerchantOrder>(`/merchant/orders/${encodeURIComponent(id)}`),
    refund: (id: string, amount: number) => http.post<MerchantOrder>(`/merchant/orders/${id}/refund`, { amount }),
    settlements: () => http.get<Settlements>('/merchant/settlements'),
  },
};
