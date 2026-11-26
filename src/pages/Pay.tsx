import { amount, sar } from '@pf/core/format';
import type { ApiError } from '@pf/core/http';
import { useI18n } from '@pf/core/react/i18n';
import { invalidate, useQuery } from '@pf/core/react/query';
import { Link, navigate, usePageMeta } from '@pf/core/react/router';
import { useEffect, useId, useRef, useState } from 'react';
import { PLANS } from '../api/plans';
import { api } from '../api/services';
import type { Card, IneligibleReason, Quote, QuoteOption } from '../api/types';
import { round2, today } from '../api/util';
import { WrongRole } from '../components/Gate';
import { Icon } from '../components/Icon';
import { CardForm, MethodPicker, MiniTimeline, ProductArt, QistMark, StoreLogo } from '../components/Qist';
import { Button, EmptyState, ErrorState, Qty, Skeleton, ui } from '../components/ui';
import { useReducedMotion } from '../lib/hooks';
import { dateShort, dateMedium, errText } from '../lib/fmt';
import { checkout, useCheckout } from '../state/checkout';
import { useRequireUser } from '../state/guard';
import { categoryOf } from './Store';
import c from './pay.module.css';
import p from './pages.module.css';

type Fail = { code: string; text: string; available?: number };

export default function Pay({ params }: { params: { productId: string } }) {
  const { t, l, lang } = useI18n();
  const productId = params.productId;
  const storeId = /^(.+)-p\d+$/.exec(productId)?.[1] ?? null;
  const user = useRequireUser(`/pay/${productId}`);
  const shopper = user?.role === 'shopper';
  const reduced = useReducedMotion();
  const draftAll = useCheckout();
  const draft = draftAll.productId === productId ? draftAll : { ...draftAll, qty: 1, planType: null, cardId: null };
  const set = (patch: Parameters<typeof checkout.set>[0]) => checkout.set({ productId, storeId, ...(draftAll.productId === productId ? {} : { qty: 1, planType: null, cardId: null }), ...patch });

  const store = useQuery(storeId ? `store:${storeId}` : null, () => api.stores.get(storeId!), { staleMs: 120_000 });
  const product = store.data?.products.find((x) => x.id === productId);
  const limit = useQuery(shopper ? `limit:${user.id}` : null, () => api.me.limit());
  const cards = useQuery(shopper ? `cards:${user.id}` : null, () => api.me.cards());
  const total = product ? round2(product.price * draft.qty) : 0;
  const quoteQ = useQuery(shopper && product ? `quote:${user.id}:${total}` : null, () => api.checkout.quote(total), { staleMs: 10_000 });
  // keep the previous quote on screen while a new total is being quoted
  const lastQuote = useRef<Quote | undefined>(undefined);
  if (quoteQ.data) lastQuote.current = quoteQ.data;
  const quote = quoteQ.data ?? lastQuote.current;

  usePageMeta(product ? l(product.title) : t('pay.title'), t('app.name'));

  const [consent, setConsent] = useState(false);
  const [consentErr, setConsentErr] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'processing'>('idle');
  const [step, setStep] = useState(0);
  const [fail, setFail] = useState<Fail | null>(null);
  const consentRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const methodRef = useRef<HTMLElement>(null);
  const planGroup = useId();

  useEffect(() => {
    if (phase !== 'processing') return setStep(0);
    const id = setTimeout(() => setStep(1), 800);
    return () => clearTimeout(id);
  }, [phase]);

  if (user && !shopper) return <WrongRole need="shopper" />;
  if (!storeId || (store.status === 'success' && !product) || store.error?.code === 'STORE_NOT_FOUND')
    return (
      <div className="container" style={{ paddingBlock: 48 }}>
        <EmptyState art={<Icon name="bag" size={64} />} title={t('pay.notFound')} action={<Link to="/stores" className={`${ui.btn} ${ui.primary} ${ui.md}`}>{t('store.all')}</Link>} />
      </div>
    );
  if (store.status === 'error') return <div className="container" style={{ paddingBlock: 48 }}><ErrorState error={store.error} onRetry={store.refetch} /></div>;

  const info = limit.data;
  const approved = info?.status === 'approved';
  const options = quote?.options ?? [];
  const chosen: QuoteOption | undefined = options.find((o) => o.plan === draft.planType && o.eligible) ?? options.find((o) => o.eligible);
  const cardList: Card[] = cards.data ?? [];
  const method: string | null =
    draft.cardId && (draft.cardId === 'applepay' || draft.cardId === 'new' || cardList.some((x) => x.id === draft.cardId))
      ? draft.cardId
      : cards.data
        ? (cardList.find((x) => x.default)?.id ?? cardList[0]?.id ?? 'new')
        : null;
  const savedCard = cardList.find((x) => x.id === method);
  const todayIso = today();
  const todayLabel = (d: string) => (d === todayIso ? t('day.today') : null);
  const nextAfterToday = chosen ? (PLANS[chosen.plan].firstToday ? chosen.payments[1] : chosen.payments[0]) : null;
  const exposure = chosen && info ? round2(info.available - chosen.limitLeft) : 0;
  const ready = !!(product && chosen && method && method !== 'new');

  const reasonText = (r: IneligibleReason, o: QuoteOption) => {
    const def = PLANS[o.plan];
    if (r === 'BELOW_MIN') return t('pay.reason.BELOW_MIN', { min: amount(def.min, lang), sar: t('common.sar') });
    if (r === 'ABOVE_MAX') return t('pay.reason.ABOVE_MAX', { max: amount(def.max ?? 0, lang), sar: t('common.sar') });
    if (r === 'LIMIT_EXCEEDED') return t('pay.reason.LIMIT_EXCEEDED', { available: amount(quote?.available ?? 0, lang), sar: t('common.sar') });
    return t('pay.reason.NOT_APPROVED');
  };

  const pickOtherCard = () => {
    const other = cardList.find((x) => x.id !== method);
    set({ cardId: other ? other.id : 'new' });
    setFail(null);
    methodRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  };

  const confirm = async () => {
    if (inFlight.current) return; // double click / Retry must not create two plans
    if (!ready || !chosen || !product || !storeId || method === 'new' || !method) return;
    if (!consent) {
      setConsentErr(true);
      consentRef.current?.focus();
      consentRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      return;
    }
    inFlight.current = true;
    setFail(null);
    setPhase('processing');
    const wait = new Promise((r) => setTimeout(r, reduced ? 250 : 1700));
    try {
      const [plan] = await Promise.all([api.checkout.create({ storeId, items: [{ productId, qty: draft.qty }], planType: chosen.plan, paymentMethodId: method }), wait]);
      checkout.clear();
      invalidate('plans');
      invalidate('limit');
      invalidate('upcoming');
      invalidate('quote');
      navigate(`/plans/${plan.id}?new=1`, { replace: true });
    } catch (e) {
      await wait;
      inFlight.current = false;
      setPhase('idle');
      const err = e as ApiError;
      if (err.code === 'LIMIT_EXCEEDED' || err.code === 'NOT_APPROVED') invalidate('limit');
      if (err.code === 'LIMIT_EXCEEDED' || err.code === 'PLAN_NOT_ALLOWED') invalidate('quote');
      if (err.code === 'CARD_EXPIRED' || err.code === 'CARD_NOT_FOUND') invalidate('cards');
      setFail({ code: err.code, text: errText(err, t), available: err.details?.available ? Number(err.details.available) : undefined });
    }
  };

  const confirmLabel = chosen && chosen.firstPayment > 0 ? t('pay.confirm.today', { amount: amount(chosen.firstPayment, lang), sar: t('common.sar') }) : t('pay.confirm');
  const confirmBtn = (cls = '') => (
    <Button size="lg" block className={cls} onClick={confirm} disabled={!ready || phase === 'processing'}>
      <Icon name="lock" size={18} /> {confirmLabel}
    </Button>
  );

  return (
    <div className={`container ${c.page}`}>
      <Link to={storeId ? `/stores/${storeId}` : '/stores'} className={p.back}>
        <Icon name="chevron-start" size={18} /> {store.data ? l(store.data.name) : t('nav.stores')}
      </Link>
      <h1 className={c.title}>{t('pay.title')}</h1>

      <div className={c.layout}>
        <div className={c.main}>
          {limit.status === 'success' && !approved && (
            <div className={`${p.alert} ${p.alert_warn}`} role="status">
              <Icon name="shield-check" size={22} />
              <div>
                <b>{t(`pay.elig.${info!.status}.title`)}</b>
                <span>{info!.status === 'declined' && info!.retryAfter ? t('pay.elig.declined.body', { date: dateShort(info!.retryAfter, lang) }) : t(`pay.elig.${info!.status}.body`)}</span>
                <div className={p.alertActions}>
                  <Link to={`/verify?next=${encodeURIComponent(`/pay/${productId}`)}`} className={`${ui.btn} ${ui.primary} ${ui.md}`}>
                    {t(info!.status === 'pending' ? 'pay.elig.check' : 'pay.elig.cta')}
                  </Link>
                </div>
              </div>
            </div>
          )}

          <section className={p.card} aria-labelledby="pay-h1">
            <h2 id="pay-h1">
              <span className={c.num}>1</span> {t('pay.s.order')}
            </h2>
            {product && store.data ? (
              <div className={c.item}>
                <div className={c.thumb}>
                  <ProductArt category={categoryOf(store.data, product.id)} palette={product.palette} />
                </div>
                <div className={c.itemMain}>
                  <b>{l(product.title)}</b>
                  <span className={c.itemStore}>
                    <StoreLogo store={store.data} size={20} /> {l(store.data.name)}
                  </span>
                  <span className="num">{sar(product.price, lang)}</span>
                </div>
                <Qty value={draft.qty} onChange={(n) => set({ qty: Math.max(1, Math.min(10, n)) })} max={10} />
              </div>
            ) : (
              <Skeleton h={84} r={14} />
            )}
            <div className={c.totalRow}>
              <span>{t('pay.total')}</span>
              <b className="num" aria-live="polite">
                {sar(total, lang)}
              </b>
            </div>
          </section>

          <section className={p.card} aria-labelledby="pay-h2">
            <h2 id="pay-h2">
              <span className={c.num}>2</span> {t('pay.s.plan')}
            </h2>
            {quoteQ.status === 'error' && !quote ? (
              <ErrorState error={quoteQ.error} onRetry={quoteQ.refetch} compact />
            ) : !quote ? (
              <div className={c.plans}>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} h={116} r={16} />
                ))}
              </div>
            ) : (
              <div className={c.plans} role="radiogroup" aria-labelledby="pay-h2" aria-busy={quoteQ.refreshing || undefined}>
                {options.map((o) => {
                  const def = PLANS[o.plan];
                  const on = chosen?.plan === o.plan;
                  return (
                    <label key={o.plan} className={`${c.plan} ${on ? c.planOn : ''} ${o.eligible ? '' : c.planOff}`}>
                      <input type="radio" name={planGroup} checked={on} disabled={!o.eligible} onChange={() => set({ planType: o.plan })} />
                      <span className={c.planHead}>
                        <span className={c.planName}>
                          <b>{l(def.name)}</b>
                          <small>{o.firstPayment > 0 ? t('pay.plan.first', { amount: amount(o.firstPayment, lang), sar: t('common.sar') }) : t('pay.plan.none')}</small>
                        </span>
                        <span className={c.planAmt}>
                          <b className="num">{amount(o.payments[o.payments.length - 1].amount, lang)}</b>
                          <small>{o.payments.length > 1 ? t('pay.plan.each', { n: o.payments.length }) : t('pay.plan.once')}</small>
                        </span>
                        <span className={c.planDot} aria-hidden="true" />
                      </span>
                      <MiniTimeline items={o.payments} dateOf={(d) => dateShort(d, lang)} todayLabel={todayLabel} />
                      {!o.eligible && o.reason && (
                        <span className={c.reason}>
                          <Icon name="info" size={14} /> {reasonText(o.reason, o)}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          <section className={p.card} aria-labelledby="pay-h3" ref={methodRef}>
            <h2 id="pay-h3">
              <span className={c.num}>3</span> {t('pay.s.method')}
            </h2>
            {cards.status === 'loading' ? (
              <Skeleton h={56} r={14} />
            ) : cards.status === 'error' ? (
              <ErrorState error={cards.error} onRetry={cards.refetch} compact />
            ) : (
              <>
                <MethodPicker cards={cardList} value={method} onChange={(v) => (set({ cardId: v }), setFail(null))} legend={t('pay.s.method')} allowNew={cardList.length < 5} />
                {method === 'new' && (
                  <CardForm
                    autoFocus
                    onAdded={(card) => set({ cardId: card.id })}
                    onCancel={cardList.length ? () => set({ cardId: cardList.find((x) => x.default)?.id ?? cardList[0].id }) : undefined}
                  />
                )}
                {savedCard && <p className={c.note}><Icon name="repeat" size={14} /> {t('pay.autopay.note')}</p>}
              </>
            )}
          </section>

          {fail && (
            <div className={`${p.alert} ${p.alert_danger}`} role="alert">
              <Icon name="alert" size={22} />
              <div>
                <b>{t(`pay.fail.${fail.code}`) !== `pay.fail.${fail.code}` ? t(`pay.fail.${fail.code}`) : t('pay.fail.generic')}</b>
                <span>{fail.code === 'LIMIT_EXCEEDED' && fail.available !== undefined ? t('pay.fail.LIMIT_EXCEEDED.body', { available: sar(fail.available, lang) }) : fail.text}</span>
                <div className={p.alertActions}>
                  {fail.code === 'CARD_DECLINED' && (
                    <>
                      <Button size="sm" onClick={pickOtherCard}>
                        <Icon name="card" size={16} /> {t('pay.fail.switch')}
                      </Button>
                      {method !== 'applepay' && (
                        <Button size="sm" variant="outline" onClick={() => (set({ cardId: 'applepay' }), setFail(null))}>
                          {t('pay.fail.applepay')}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={confirm}>
                        <Icon name="refresh" size={16} /> {t('common.retry')}
                      </Button>
                    </>
                  )}
                  {(fail.code === 'CARD_EXPIRED' || fail.code === 'CARD_NOT_FOUND') && (
                    <Button size="sm" onClick={pickOtherCard}>
                      {t('pay.fail.switch')}
                    </Button>
                  )}
                  {fail.code === 'NOT_APPROVED' && (
                    <Link to={`/verify?next=${encodeURIComponent(`/pay/${productId}`)}`} className={`${ui.btn} ${ui.primary} ${ui.sm}`}>
                      {t('pay.elig.cta')}
                    </Link>
                  )}
                  {(fail.code === 'LIMIT_EXCEEDED' || fail.code === 'PLAN_NOT_ALLOWED') && (
                    <Button size="sm" variant="ghost" onClick={() => setFail(null)}>
                      {t('pay.fail.choose')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className={c.side} aria-label={t('pay.next.title')}>
          <div className={p.card}>
            <h2>{t('pay.next.title')}</h2>
            {chosen ? (
              <ul className={c.next}>
                <li>
                  <Icon name={chosen.firstPayment > 0 ? 'check' : 'clock'} size={18} />
                  <span>{chosen.firstPayment > 0 ? t('pay.next.today', { amount: sar(chosen.firstPayment, lang) }) : t('pay.next.nothing')}</span>
                </li>
                {nextAfterToday && (
                  <li>
                    <Icon name="calendar" size={18} />
                    <span>{t('pay.next.next', { amount: sar(nextAfterToday.amount, lang), date: dateMedium(nextAfterToday.dueDate, lang) })}</span>
                  </li>
                )}
                <li>
                  <Icon name="percent" size={18} />
                  <span>{t('pay.next.free', { total: sar(chosen.payments.reduce((a, x) => a + x.amount, 0), lang) })}</span>
                </li>
              </ul>
            ) : (
              <p className={p.muted}>{quote ? t('pay.next.pick') : t('common.loading')}</p>
            )}

            {approved && info && (
              <div className={c.limit}>
                <div className={p.spread}>
                  <b>{t('pay.limit.title')}</b>
                  <span className={`${c.limitNums} num`} aria-live="polite">
                    {chosen ? t('pay.limit.after', { before: amount(info.available, lang), after: amount(chosen.limitLeft, lang), sar: t('common.sar') }) : t('pay.limit.avail', { amount: sar(info.available, lang) })}
                  </span>
                </div>
                <div className={c.limitBar} role="img" aria-label={t('pay.limit.aria', { used: sar(info.used, lang), order: sar(exposure, lang), left: sar(chosen ? chosen.limitLeft : info.available, lang) })}>
                  <i className={c.limitUsed} style={{ width: `${(info.used / info.limit) * 100}%` }} />
                  <i className={c.limitOrder} style={{ width: `${(exposure / info.limit) * 100}%` }} />
                </div>
                <div className={c.legend}>
                  <span><i className={c.limitUsed} /> {t('pay.limit.used')}</span>
                  <span><i className={c.limitOrder} /> {t('pay.limit.order')}</span>
                  <span><i className={c.limitFree} /> {t('pay.limit.free')}</span>
                </div>
              </div>
            )}

            <label className={`${c.consent} ${consentErr && !consent ? c.consentErr : ''}`}>
              <input
                ref={consentRef}
                type="checkbox"
                checked={consent}
                aria-invalid={(consentErr && !consent) || undefined}
                onChange={(e) => (setConsent(e.target.checked), setConsentErr(false))}
              />
              <span>{t('pay.consent')}</span>
            </label>
            {consentErr && !consent && (
              <p className={p.formError} role="alert">
                {t('pay.consent.err')}
              </p>
            )}
            <div className={c.desktopBtn}>{confirmBtn()}</div>
            <p className={c.legal}>{t('pay.legal')}</p>
          </div>
        </aside>
      </div>

      <div className={c.bar}>
        <div>
          <small>{chosen ? (chosen.firstPayment > 0 ? t('pay.bar.today') : t('pay.bar.later')) : t('pay.total')}</small>
          <b className="num">{sar(chosen ? chosen.firstPayment : total, lang)}</b>
        </div>
        {confirmBtn(c.barBtn)}
      </div>

      {phase === 'processing' && (
        <div className={c.processing} role="status" aria-live="assertive">
          <div className={c.procCard}>
            <QistMark size={72} animate />
            <b>{t(step === 0 ? 'pay.proc.1' : 'pay.proc.2')}</b>
            <small>{t('pay.proc.note')}</small>
          </div>
        </div>
      )}
    </div>
  );
}
