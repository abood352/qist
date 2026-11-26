import type { PlanType } from '../api/types';
import { persisted } from './store';

/**
 * The partner-checkout draft (product → plan → card) survives a reload, so a shopper who leaves to verify
 * their identity or add a card comes back to the same basket.
 */
export interface CheckoutDraft {
  storeId: string | null;
  productId: string | null;
  qty: number;
  planType: PlanType | null;
  /** a saved card id or 'applepay' */
  cardId: string | null;
}

const EMPTY: CheckoutDraft = { storeId: null, productId: null, qty: 1, planType: null, cardId: null };
const store = persisted<CheckoutDraft>('qist-checkout', EMPTY);

export const checkout = {
  get: store.get,
  set: (p: Partial<CheckoutDraft>) => store.set(p),
  clear: () => store.set(EMPTY),
};
export const useCheckout = store.use;
