import { amount, date as fmtDate, sar } from '@pf/core/format';
import type { ApiError } from '@pf/core/http';
import { useI18n } from '@pf/core/react/i18n';
import { invalidate, setCached, useQuery } from '@pf/core/react/query';
import { Link, setQuery, useLocation, usePageMeta } from '@pf/core/react/router';
import { toast } from '@pf/core/react/toast';
import { useEffect, useRef, useState } from 'react';
import { LATE_FEE, LATE_FEE_CAP_RATE, MAX_LATE_FEES, PLANS } from '../api/plans';
import { api } from '../api/services';
import type { Plan as PlanT } from '../api/types';
import { round2 } from '../api/util';
import { WrongRole } from '../components/Gate';
import { Icon } from '../components/Icon';
import { MethodLabel, MethodSelect, resolveMethod, SegBar, StatusChip, StoreLogo } from '../components/Qist';
import { Badge, Button, Dialog, EmptyState, ErrorState, Skeleton, ui } from '../components/ui';
import { dateFull, dateMedium, errText, hijriShort, planTitle } from '../lib/fmt';
import { useRequireUser } from '../state/guard';
import p from './pages.module.css';

type Act = { kind: 'pay'; n: number } | { kind: 'settle' } | { kind: 'method' };

function ActionDialog({ plan, act, uid, onClose, onDone }: { plan: PlanT; act: Act; uid: string; onClose: () => void; onDone: (res: PlanT, act: Act) => void }) {
  const { t, lang } = useI18n();
  const cards = useQuery(`cards:${uid}`, () => api.me.cards());
  const [chosen, setChosen] = useState<string | null>(plan.paymentMethodId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; text: string } | null>(null);
  const applePay = act.kind !== 'method';
  const method = resolveMethod(cards.data, chosen, applePay);
  const inst = act.kind === 'pay' ? plan.payments.find((x) => x.n === act.n) : undefined;
  const principalLeft = round2(plan.payments.filter((x) => x.status !== 'paid' && x.status !== 'refunded').reduce((a, x) => a + x.amount, 0));
  const due = act.kind === 'pay' && inst ? round2(inst.amount + inst.lateFee) : plan.remaining;
  const title = act.kind === 'pay' ? t('plan.pay.title', { n: act.n }) : act.kind === 'settle' ? t('plan.settle.title') : t('plan.method.title');

  const run = async () => {
    if (!method || method === 'new') return;
    setBusy(true);
    setErr(null);
    try {
      const res = act.kind === 'pay' ? await api.plans.pay(plan.id, act.n, method) : act.kind === 'settle' ? await api.plans.settle(plan.id, method) : await api.plans.update(plan.id, { paymentMethodId: method });
      onDone(res, act);
    } catch (e) {
      const ae = e as ApiError;
      if (ae.code === 'CARD_EXPIRED' || ae.code === 'CARD_NOT_FOUND') invalidate('cards');
      setErr({ code: ae.code, text: errText(ae, t) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={title}>
      <div className={p.skelRow} style={{ gap: 16 }}>
        {act.kind !== 'method' && (
          <dl className={p.kv}>
            <div>
              <dt>{act.kind === 'pay' ? t('plan.pay.amount') : t('plan.settle.amount')}</dt>
              <dd className="num">{sar(due, lang)}</dd>
            </div>
            {act.kind === 'pay' && inst && inst.lateFee > 0 && (
              <div>
                <dt>{t('plan.pay.includesFee')}</dt>
                <dd className="num">{sar(inst.lateFee, lang)}</dd>
              </div>
            )}
            {act.kind === 'settle' && (
              <div>
                <dt>{t('plan.settle.frees')}</dt>
                <dd className="num">{sar(principalLeft, lang)}</dd>
              </div>
            )}
          </dl>
        )}
        {act.kind === 'settle' && (
          <div className={`${p.alert} ${p.alert_info}`}>
            <Icon name="info" size={20} />
            <div>
              <b>{t('plan.settle.charge', { amount: sar(due, lang), frees: sar(principalLeft, lang) })}</b>
              <span>{t('plan.settle.note')}</span>
            </div>
          </div>
        )}
        {cards.status === 'loading' ? <Skeleton h={56} r={14} /> : <MethodSelect cards={cards.data ?? []} value={method} onChange={(v) => (setChosen(v), setErr(null))} legend={t('pay.s.method')} applePay={applePay} />}
        {err && (
          <div className={`${p.alert} ${p.alert_danger}`} role="alert">
            <Icon name="alert" size={20} />
            <div>
              <b>{t(`pay.fail.${err.code}`) !== `pay.fail.${err.code}` ? t(`pay.fail.${err.code}`) : t('pay.fail.generic')}</b>
              <span>{err.text}</span>
            </div>
          </div>
        )}
        <Button size="lg" block loading={busy} disabled={!method || method === 'new'} onClick={run}>
          {act.kind === 'method' ? t('common.save') : t('plan.pay.confirm', { amount: sar(due, lang) })}
        </Button>
      </div>
    </Dialog>
  );
}

export default function Plan({ params }: { params: { id: string } }) {
  const { t, l, lang } = useI18n();
  const { query } = useLocation();
  const user = useRequireUser(`/plans/${params.id}`);
  const shopper = user?.role === 'shopper';
  const uid = user?.id ?? '';
  const key = `plan:${uid}:${params.id}`;
  const res = useQuery(shopper ? key : null, () => api.plans.get(params.id));
  const cards = useQuery(shopper ? `cards:${uid}` : null, () => api.me.cards());
  const plan = res.data;
  const [celebrate] = useState(() => query.get('new') === '1');
  const [act, setAct] = useState<Act | null>(null);
  const payParam = useRef(query.get('pay'));
  usePageMeta(plan ? planTitle(plan.items, lang, t) : t('plans.title'), t('app.name'));

  useEffect(() => {
    if (celebrate) setQuery({ new: null });
  }, [celebrate]);
  useEffect(() => {
    if (!plan || !payParam.current) return;
    const n = Number(payParam.current);
    payParam.current = null;
    setQuery({ pay: null });
    if (plan.payments.some((x) => x.n === n && x.status !== 'paid' && x.status !== 'refunded')) setAct({ kind: 'pay', n });
  }, [plan]);

  if (user && !shopper) return <WrongRole need="shopper" />;
  if (res.status === 'error' && !plan)
    return (
      <div className="container" style={{ paddingBlock: 48 }}>
        {res.error?.code === 'PLAN_NOT_FOUND' ? (
          <EmptyState art={<Icon name="receipt" size={64} />} title={t('plan.notFound')} action={<Link to="/plans" className={`${ui.btn} ${ui.primary} ${ui.md}`}>{t('plan.all')}</Link>} />
        ) : (
          <ErrorState error={res.error} onRetry={res.refetch} />
        )}
      </div>
    );
  if (!plan)
    return (
      <div className={`container ${p.mid}`}>
        <Skeleton w="50%" h={28} />
        <Skeleton h={120} r={22} />
        <Skeleton h={280} r={22} />
      </div>
    );

  const late = plan.payments.some((x) => x.status === 'late');
  const unpaid = plan.payments.filter((x) => x.status === 'due' || x.status === 'late' || x.status === 'upcoming');
  const first = unpaid[0];
  const paidCount = plan.payments.filter((x) => x.status === 'paid').length;
  const method = cards.data?.find((c) => c.id === plan.paymentMethodId);
  const savedMethod = plan.paymentMethodId !== 'applepay';
  const firstPaidToday = PLANS[plan.planType].firstToday ? plan.payments[0] : null;

  const done = (next: PlanT, a: Act) => {
    setCached(key, () => next);
    invalidate('plans');
    invalidate('limit');
    invalidate('upcoming');
    setAct(null);
    toast(a.kind === 'pay' ? t('plan.toast.paid') : a.kind === 'settle' ? t('plan.toast.settled') : t('plan.toast.method'));
  };

  const toggleAuto = async () => {
    const prev = plan;
    setCached<PlanT>(key, (o) => ({ ...o!, autopay: !prev.autopay }));
    try {
      const next = await api.plans.update(plan.id, { autopay: !prev.autopay });
      setCached(key, () => next);
      invalidate('plans');
      invalidate('upcoming');
      toast(next.autopay ? t('plan.autopay.on') : t('plan.autopay.off'));
    } catch (e) {
      setCached(key, () => prev);
      toast(errText(e, t), { tone: 'err' });
    }
  };

  const fmtPaid = (iso: string) => fmtDate(iso, lang, { day: 'numeric', month: 'short' });

  return (
    <div className={p.mid}>
      <Link to="/plans" className={p.back}>
        <Icon name="chevron-start" size={18} /> {t('plan.all')}
      </Link>

      {celebrate && (
        <div className={p.party} role="status">
          <div className={p.confetti} aria-hidden="true">
            {Array.from({ length: 22 }, (_, i) => (
              <i key={i} style={{ ['--x' as string]: (i * 37) % 100, ['--d' as string]: (i * 90) % 700, ['--c' as string]: ['#10231c', '#0d6e4f', '#ffffff', '#b7791f', '#c4412c'][i % 5] }} />
            ))}
          </div>
          <span className={p.partyIcon}>
            <Icon name="check" size={30} />
          </span>
          <h2>{t('plan.party.title')}</h2>
          <p>
            {firstPaidToday ? t('plan.party.paid', { amount: sar(firstPaidToday.amount, lang) }) : t('plan.party.later')}{' '}
            {plan.nextDue ? t('plan.party.next', { date: dateFull(plan.nextDue.dueDate, lang), amount: sar(plan.nextDue.amount, lang) }) : ''}
          </p>
        </div>
      )}

      <header className={p.card}>
        <div className={p.planHead}>
          <StoreLogo store={plan.store} size={52} />
          <div className={p.grow}>
            <h1>{planTitle(plan.items, lang, t)}</h1>
            <span className={p.muted}>
              {l(plan.store.name)} · <span className="ltr">{plan.code}</span> · {l(PLANS[plan.planType].name)}
            </span>
          </div>
          <Badge tone={plan.status === 'completed' ? 'green' : plan.status === 'active' ? (late ? 'danger' : 'accent') : 'neutral'}>{late ? t('plans.late') : t(`plan.status.${plan.status}`)}</Badge>
        </div>
        <SegBar payments={plan.payments} label={t('plans.progress', { paid: paidCount, total: plan.payments.length })} />
        <div className={p.stats}>
          <div>
            <small>{t('plan.total')}</small>
            <b className="num">{sar(plan.total, lang)}</b>
          </div>
          <div>
            <small>{t('plan.paid')}</small>
            <b className="num">{sar(plan.paid, lang)}</b>
          </div>
          <div>
            <small>{t('plans.left')}</small>
            <b className="num" aria-live="polite">
              {sar(plan.remaining, lang)}
            </b>
          </div>
        </div>
      </header>

      {late && (
        <section className={`${p.alert} ${p.alert_danger}`} aria-label={t('plan.late.title')}>
          <Icon name="alert" size={22} />
          <div>
            <b>{t('plan.late.title')}</b>
            <span>{t('plan.late.body', { fee: sar(LATE_FEE, lang), cap: Math.round(LATE_FEE_CAP_RATE * 100), max: MAX_LATE_FEES })}</span>
            {plan.lateFees > 0 && <span>{t('plan.late.so', { fees: sar(plan.lateFees, lang) })}</span>}
            <span className={p.small}>{t('plan.late.demo')}</span>
          </div>
        </section>
      )}

      <section className={p.card} aria-labelledby="plan-sched">
        <div className={p.cardHead}>
          <h2 id="plan-sched">{t('plan.schedule')}</h2>
          {unpaid.length >= 2 && (
            <Button size="sm" variant="outline" onClick={() => setAct({ kind: 'settle' })}>
              <Icon name="bolt" size={16} /> {t('plan.settle.cta', { amount: sar(plan.remaining, lang) })}
            </Button>
          )}
        </div>
        <ol className={p.timeline}>
          {plan.payments.map((x) => (
            <li key={x.n} className={`${p.tl} ${p['tl_' + x.status]}`}>
              <span className={p.tlDot}>
                <Icon name={x.status === 'paid' ? 'check' : x.status === 'late' ? 'alert' : x.status === 'due' ? 'clock' : x.status === 'refunded' ? 'return' : 'calendar'} size={14} style={{ color: x.status === 'upcoming' || x.status === 'refunded' ? 'var(--text-3)' : 'var(--on-accent)' }} />
              </span>
              <div className={p.tlMain}>
                <b>{t('plan.instalment', { n: x.n, of: plan.payments.length })}</b>
                <small>
                  {dateMedium(x.dueDate, lang)} <span className={p.tag}>· {hijriShort(x.dueDate, lang)}</span>
                </small>
                {x.status === 'paid' && x.paidAt && (
                  <small>
                    {t('plan.paidOn', { date: fmtPaid(x.paidAt) })} · <MethodLabel method={x.method} />
                  </small>
                )}
                {x.lateFee > 0 && <small className={p.lateText}>{x.status === 'paid' ? t('plan.lateFee.paid', { fee: sar(x.lateFee, lang) }) : t('plan.lateFee', { fee: sar(x.lateFee, lang) })}</small>}
                {x.refunded > 0 && <small>{t('plan.refunded', { amount: sar(x.refunded, lang) })}</small>}
              </div>
              <div className={p.tlEnd}>
                <b className="num">{sar(x.status === 'paid' || x.status === 'refunded' ? x.amount : round2(x.amount + x.lateFee), lang)}</b>
                <StatusChip status={x.status} />
              </div>
              {first?.n === x.n && (
                <div className={p.tlAction}>
                  <Button size="sm" variant={x.status === 'upcoming' ? 'outline' : 'primary'} onClick={() => setAct({ kind: 'pay', n: x.n })}>
                    {x.status === 'upcoming' ? t('plan.payEarly') : t('plans.payNow')}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ol>
        {plan.status === 'completed' && (
          <div className={`${p.alert} ${p.alert_ok}`}>
            <Icon name="shield-check" size={20} />
            <div>
              <b>{t('plan.done.title')}</b>
              <span>{t('plan.done.body')}</span>
            </div>
          </div>
        )}
      </section>

      {plan.status === 'active' && (
        <section className={p.card} aria-labelledby="plan-auto">
          <div className={p.switchRow}>
            <div>
              <h2 id="plan-auto">{t('plan.autopay.title')}</h2>
              <p className={`${p.muted} ${p.small}`}>{savedMethod ? t('plan.autopay.body') : t('plan.autopay.needCard')}</p>
              <p className={p.small} style={{ marginTop: 6 }}>
                {t('plan.autopay.from')} {savedMethod ? <MethodLabel method={method ? { type: method.brand, last4: method.last4 } : undefined} /> : <MethodLabel method={{ type: 'applepay' }} />}
              </p>
            </div>
            <button role="switch" aria-checked={plan.autopay} aria-labelledby="plan-auto" className={p.switch} onClick={toggleAuto} disabled={!savedMethod && !plan.autopay} />
          </div>
          <div>
            <Button size="sm" variant="ghost" onClick={() => setAct({ kind: 'method' })}>
              <Icon name="card" size={16} /> {t('plan.method.change')}
            </Button>
          </div>
        </section>
      )}

      <section className={p.card} aria-labelledby="plan-receipt">
        <h2 id="plan-receipt">{t('plan.receipt')}</h2>
        <ul className={p.items}>
          {plan.items.map((it, i) => (
            <li key={i}>
              <span>
                {l(it.title)} <span className={p.muted}>× {it.qty}</span>
              </span>
              <b className="num">{amount(it.price * it.qty, lang)}</b>
            </li>
          ))}
        </ul>
        <dl className={p.kv}>
          <div>
            <dt>{t('plan.total')}</dt>
            <dd className="num">{sar(plan.total, lang)}</dd>
          </div>
          {plan.refunded > 0 && (
            <div>
              <dt>{t('plan.refundedTotal')}</dt>
              <dd className="num">{sar(plan.refunded, lang)}</dd>
            </div>
          )}
          {plan.lateFees > 0 && (
            <div>
              <dt>{t('plan.lateFees')}</dt>
              <dd className="num">{sar(plan.lateFees, lang)}</dd>
            </div>
          )}
          <div>
            <dt>{t('plan.interest')}</dt>
            <dd>{t('plan.interest.none')}</dd>
          </div>
          <div>
            <dt>{t('plan.orderedOn')}</dt>
            <dd>{fmtDate(plan.createdAt, lang)}</dd>
          </div>
          <div>
            <dt>{t('plan.orderNo')}</dt>
            <dd className="ltr">{plan.code}</dd>
          </div>
        </dl>
      </section>

      {act && <ActionDialog plan={plan} act={act} uid={uid} onClose={() => setAct(null)} onDone={done} />}
    </div>
  );
}
