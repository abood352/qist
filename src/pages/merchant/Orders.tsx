import { amount, date as fmtDate, sar } from '@pf/core/format';
import type { ApiError } from '@pf/core/http';
import { useI18n } from '@pf/core/react/i18n';
import { invalidate, setCached, useQuery } from '@pf/core/react/query';
import { setQuery, useLocation } from '@pf/core/react/router';
import { toast } from '@pf/core/react/toast';
import { useState } from 'react';
import { applyRefund, MDR_FIXED, MDR_RATE, merchantFee, PLANS } from '../../api/plans';
import { api } from '../../api/services';
import type { MerchantOrder, PlanStatus, StoredPayment } from '../../api/types';
import { cents, round2 } from '../../api/util';
import { Icon } from '../../components/Icon';
import { StatusChip } from '../../components/Qist';
import { Badge, Button, Dialog, EmptyState, ErrorState, Field, Pagination, Skeleton } from '../../components/ui';
import { dateFull, dateShort, errText } from '../../lib/fmt';
import { useDebounced } from '../../lib/hooks';
import { orderState } from './shared';
import m from './merchant.module.css';
import p from '../pages.module.css';

type Filter = PlanStatus | 'late' | '';
const FILTERS: Filter[] = ['', 'active', 'late', 'completed', 'refunded'];

/** the proportional effect of a refund, computed with the same rule the API applies */
function previewRefund(o: MerchantOrder, amt: number) {
  const before: StoredPayment[] = o.payments.map((x) => ({
    n: x.n,
    dueDate: x.dueDate,
    amount: x.amount,
    status: x.status === 'paid' ? 'paid' : x.status === 'refunded' ? 'refunded' : 'upcoming',
    refunded: x.refunded,
  }));
  const after = applyRefund(before, amt);
  let future = 0;
  let cash = 0;
  after.forEach((a, i) => {
    const delta = cents(a.refunded ?? 0) - cents(before[i].refunded ?? 0);
    if (before[i].status === 'upcoming') future += delta;
    else cash += delta;
  });
  const netAfter = round2(o.total - o.refunded - amt);
  const feeAfter = merchantFee(netAfter);
  return { future: future / 100, cash: cash / 100, netAfter, feeAfter, storeAfter: round2(netAfter - feeAfter) };
}

function RefundDialog({ order, onClose, onDone }: { order: MerchantOrder; onClose: () => void; onDone: (o: MerchantOrder) => void }) {
  const { t, lang } = useI18n();
  const left = round2(order.total - order.refunded);
  const [mode, setMode] = useState<'full' | 'partial'>('full');
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const partial = Number(raw);
  const amt = mode === 'full' ? left : round2(partial);
  const valid = Number.isFinite(amt) && amt > 0 && amt <= left;
  const pv = valid ? previewRefund(order, amt) : null;

  const run = async () => {
    if (!valid) return;
    setBusy(true);
    setErr('');
    try {
      onDone(await api.merchant.refund(order.id, amt));
    } catch (e) {
      setErr(errText(e as ApiError, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={t('merchant.refund.title')}>
      <div className={m.dlg}>
        <p className={p.muted}>{t('merchant.refund.sub', { amount: sar(left, lang) })}</p>
        <fieldset className={p.fieldset}>
          <legend className="sr-only">{t('merchant.refund.title')}</legend>
          <div className={m.radios}>
            <label className={m.radio}>
              <input type="radio" name="refund-mode" checked={mode === 'full'} onChange={() => setMode('full')} />
              {t('merchant.refund.full', { amount: sar(left, lang) })}
            </label>
            <label className={m.radio}>
              <input type="radio" name="refund-mode" checked={mode === 'partial'} onChange={() => setMode('partial')} />
              {t('merchant.refund.partial')}
            </label>
          </div>
        </fieldset>
        {mode === 'partial' && (
          <Field
            label={t('merchant.refund.amount')}
            type="number"
            inputMode="decimal"
            min={1}
            max={left}
            step="0.01"
            value={raw}
            dir="ltr"
            autoFocus
            onChange={(e) => setRaw(e.target.value)}
            error={raw && !valid ? t('merchant.refund.invalid', { max: sar(left, lang) }) : undefined}
          />
        )}
        {pv && (
          <div className={m.preview} aria-live="polite">
            <b>{t('merchant.refund.effect')}</b>
            <div>
              <span>{t('merchant.refund.future')}</span>
              <b className="num">{sar(pv.future, lang)}</b>
            </div>
            <div>
              <span>{t('merchant.refund.cash')}</span>
              <b className="num">{sar(pv.cash, lang)}</b>
            </div>
            <div>
              <span>{t('merchant.refund.store')}</span>
              <b className="num">
                {sar(order.net, lang)} → {sar(pv.storeAfter, lang)}
              </b>
            </div>
          </div>
        )}
        {pv && (
          <>
            <p>{t('merchant.refund.shopper', { future: sar(pv.future, lang), cash: sar(pv.cash, lang) })}</p>
            <p>{t('merchant.refund.limit', { future: sar(pv.future, lang) })}</p>
          </>
        )}
        <p className={p.formError}>{t('merchant.refund.irreversible')}</p>
        {err && (
          <p className={p.formError} role="alert">
            {err}
          </p>
        )}
        <Button variant="danger" size="lg" block loading={busy} disabled={!valid} onClick={run}>
          {t('merchant.refund.confirm', { amount: valid ? sar(amt, lang) : '' })}
        </Button>
      </div>
    </Dialog>
  );
}

function OrderDialog({ id, uid, onClose }: { id: string; uid: string; onClose: () => void }) {
  const { t, l, lang } = useI18n();
  const key = `morder:${uid}:${id}`;
  const res = useQuery(key, () => api.merchant.order(id));
  const [refunding, setRefunding] = useState(false);
  const o = res.data;

  return (
    <Dialog open onClose={onClose} title={o ? t('merchant.order.title', { code: o.code }) : t('merchant.order.loading')} wide>
      {res.status === 'error' && !o ? (
        <ErrorState error={res.error} onRetry={res.refetch} compact />
      ) : !o ? (
        <div className={m.dlg}>
          <Skeleton h={80} r={14} />
          <Skeleton h={160} r={14} />
        </div>
      ) : (
        <div className={m.dlg}>
          <div className={p.spread}>
            <div>
              <b>{o.customer}</b> <span className={p.muted}>· {fmtDate(o.createdAt, lang)}</span>
              <div className={p.muted}>{l(PLANS[o.planType].name)}</div>
            </div>
            <Badge tone={orderState(o).tone}>{t(`plan.status.${orderState(o).key}`)}</Badge>
          </div>

          <ul className={p.items}>
            {o.items.map((it, i) => (
              <li key={i}>
                <span>
                  {l(it.title)} <span className={p.muted}>× {it.qty}</span>
                </span>
                <b className="num">{amount(it.price * it.qty, lang)}</b>
              </li>
            ))}
          </ul>

          <section aria-labelledby="mo-sched">
            <h3 id="mo-sched" style={{ marginBottom: 6 }}>
              {t('merchant.order.schedule')}
            </h3>
            <ol className={m.sched}>
              {o.payments.map((x) => (
                <li key={x.n}>
                  <span>
                    {t('plan.instalment', { n: x.n, of: o.payments.length })} <span className={p.muted}>· {dateShort(x.dueDate, lang)}</span>
                  </span>
                  <b className="num">{sar(x.amount, lang)}</b>
                  <StatusChip status={x.status} />
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="mo-fee">
            <h3 id="mo-fee" style={{ marginBottom: 6 }}>
              {t('merchant.order.fee.title')}
            </h3>
            <dl className={m.fee}>
              <div>
                <dt>{t('merchant.order.net')}</dt>
                <dd className="num">{sar(round2(o.total - o.refunded), lang)}</dd>
              </div>
              <div>
                <dt>{t('merchant.order.mdr', { n: Math.round(MDR_RATE * 100) })}</dt>
                <dd className="num">− {sar(round2((o.total - o.refunded) * MDR_RATE), lang)}</dd>
              </div>
              <div>
                <dt>{t('merchant.order.fixed')}</dt>
                <dd className="num">− {sar(o.fee > 0 ? MDR_FIXED : 0, lang)}</dd>
              </div>
              <div className={m.feeTotal}>
                <dt>{t('merchant.order.receive')}</dt>
                <dd className="num">{sar(o.net, lang)}</dd>
              </div>
            </dl>
            <p className={`${p.muted} ${p.small}`} style={{ marginTop: 8 }}>
              {o.settled ? t('merchant.order.settled', { date: dateFull(o.settleDate, lang) }) : t('merchant.order.settles', { date: dateFull(o.settleDate, lang) })}
              {o.refunded > 0 && ` · ${t('merchant.order.refunded', { amount: sar(o.refunded, lang) })}`}
            </p>
          </section>

          <Button variant="outline" disabled={o.total - o.refunded <= 0} onClick={() => setRefunding(true)}>
            <Icon name="return" size={16} /> {t('merchant.refund.cta')}
          </Button>
          {refunding && (
            <RefundDialog
              order={o}
              onClose={() => setRefunding(false)}
              onDone={(next) => {
                setCached(key, () => next);
                invalidate('morders');
                invalidate('mstats');
                invalidate('msettle');
                setRefunding(false);
                toast(t('merchant.refund.done'));
              }}
            />
          )}
        </div>
      )}
    </Dialog>
  );
}

export default function Orders({ uid }: { uid: string }) {
  const { t, lang } = useI18n();
  const { query } = useLocation();
  const status = (FILTERS as string[]).includes(query.get('status') ?? '') ? (query.get('status') as Filter) : '';
  const page = Math.max(1, Number(query.get('page')) || 1);
  const [text, setText] = useState(query.get('q') ?? '');
  const q = useDebounced(text, 300);
  const open = query.get('order');
  const res = useQuery(`morders:${uid}:${status}:${q}:${page}`, () => api.merchant.orders({ status: status || undefined, q, page }), { refetchMs: 15_000 });

  return (
    <>
      <div className={p.toolbar}>
        <label className={p.search}>
          <span className="sr-only">{t('merchant.orders.search')}</span>
          <Icon name="search" size={18} />
          <input
            type="search"
            value={text}
            placeholder={t('merchant.orders.search')}
            onChange={(e) => {
              setText(e.target.value);
              setQuery({ q: e.target.value || null, page: null });
            }}
          />
        </label>
      </div>
      <div className={p.chips} role="group" aria-label={t('merchant.orders.filter')}>
        {FILTERS.map((f) => (
          <button key={f || 'all'} className={p.chip} aria-pressed={status === f} onClick={() => setQuery({ status: f || null, page: null })}>
            {f ? t(`plan.status.${f}`) : t('common.any')}
          </button>
        ))}
      </div>

      {res.status === 'error' && !res.data ? (
        <ErrorState error={res.error} onRetry={res.refetch} />
      ) : !res.data ? (
        <div className={m.tableWrap} style={{ padding: 16, display: 'grid', gap: 12 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} h={36} r={10} />
          ))}
        </div>
      ) : res.data.items.length === 0 ? (
        <EmptyState art={<Icon name="receipt" size={64} />} title={t('merchant.orders.empty')} body={t('merchant.orders.empty.body')} />
      ) : (
        <>
          <div className={m.tableWrap}>
            <table className={m.table}>
              <caption className="sr-only">{t('merchant.nav.orders')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('merchant.col.order')}</th>
                  <th scope="col">{t('merchant.col.customer')}</th>
                  <th scope="col">{t('merchant.col.date')}</th>
                  <th scope="col">{t('merchant.col.status')}</th>
                  <th scope="col" className={m.num}>
                    {t('merchant.col.total')}
                  </th>
                  <th scope="col" className={m.num}>
                    {t('merchant.col.net')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {res.data.items.map((o) => {
                  const st = orderState(o);
                  return (
                    <tr key={o.id}>
                      <td data-l={t('merchant.col.order')}>
                        <button className={`${m.codeBtn} ltr`} onClick={() => setQuery({ order: o.id }, { replace: false })}>
                          {o.code}
                        </button>
                      </td>
                      <td data-l={t('merchant.col.customer')}>{o.customer}</td>
                      <td data-l={t('merchant.col.date')}>{fmtDate(o.createdAt, lang, { day: 'numeric', month: 'short' })}</td>
                      <td data-l={t('merchant.col.status')}>
                        <Badge tone={st.tone}>{t(`plan.status.${st.key}`)}</Badge>
                      </td>
                      <td data-l={t('merchant.col.total')} className={`${m.num} num`}>
                        {sar(o.total - o.refunded, lang)}
                      </td>
                      <td data-l={t('merchant.col.net')} className={`${m.num} num`}>
                        {sar(o.net, lang)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={res.data.page} pages={res.data.pages} onPage={(n) => setQuery({ page: n })} />
        </>
      )}
      {open && <OrderDialog id={open} uid={uid} onClose={() => setQuery({ order: null })} />}
    </>
  );
}
