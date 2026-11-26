import type { MerchantOrder } from '../../api/types';

/** The status label of an order for the store: a late instalment makes an active plan "late". */
export function orderState(o: Pick<MerchantOrder, 'status' | 'payments'>): { key: 'active' | 'completed' | 'cancelled' | 'refunded' | 'late'; tone: 'neutral' | 'green' | 'danger' | 'accent' | 'warn' } {
  if (o.status === 'active' && o.payments.some((x) => x.status === 'late')) return { key: 'late', tone: 'danger' };
  if (o.status === 'completed') return { key: 'completed', tone: 'green' };
  if (o.status === 'refunded') return { key: 'refunded', tone: 'accent' };
  if (o.status === 'cancelled') return { key: 'cancelled', tone: 'neutral' };
  return { key: 'active', tone: 'neutral' };
}
