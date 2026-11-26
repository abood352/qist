import { amount, sar } from '@pf/core/format';
import { useI18n } from '@pf/core/react/i18n';
import { useQuery } from '@pf/core/react/query';
import { Link, navigate, setQuery, useLocation, usePageMeta } from '@pf/core/react/router';
import { PLANS } from '../api/plans';
import { api } from '../api/services';
import type { Plan, UpcomingItem } from '../api/types';
import { round2, today } from '../api/util';
import { WrongRole } from '../components/Gate';
import { Icon } from '../components/Icon';
import { LimitRing, SegBar, StoreLogo } from '../components/Qist';
import { Button, EmptyState, ErrorState, Skeleton, ui } from '../components/ui';
import { dateMedium, monthKey, planTitle, relDays } from '../lib/fmt';
import { tabKeyHandler, useAutopaySync } from '../lib/hooks';
import { useRequireUser } from '../state/guard';
import p from './pages.module.css';

type Tab = 'active' | 'completed' | 'all';

export const isLatePlan = (pl: Plan) => pl.payments.some((x) => x.status === 'late');

export function PlanRow({ plan, i }: { plan: Plan; i: number }) {
  const { t, l, lang } = useI18n();
  const late = isLatePlan(plan);
  const paidCount = plan.payments.filter((x) => x.status === 'paid').length;
  const dueSoon = plan.nextDue && plan.nextDue.daysUntil <= 3;
  return (
    <li>
      <Link to={`/plans/${plan.id}`} className={p.planRow} style={{ ['--i' as string]: i }}>
        <StoreLogo store={plan.store} size={48} />
        <div className={p.planRowMain}>
          <b>{planTitle(plan.items, lang, t)}</b>
          <small>
            {l(plan.store.name)} · <span className="ltr">{plan.code}</span> · {l(PLANS[plan.planType].name)}
          </small>
        </div>
        <div className={p.planRowEnd}>
          {plan.status === 'active' ? (
            <>
              <b className="num">{amount(plan.remaining, lang)}</b>
              <small className={p.muted}>{t('plans.left')}</small>
            </>
          ) : (
            <small className={p.muted}>{t(`plan.status.${plan.status}`)}</small>
          )}
        </div>
        <div className={p.planRowBar}>
          <SegBar payments={plan.payments} label={t('plans.progress', { paid: paidCount, total: plan.payments.length })} />
          <span className={late ? p.lateText : dueSoon ? p.dueText : undefined}>
            {late ? (
              <>
                <Icon name="alert" size={14} /> {t('plans.late')}
              </>
            ) : plan.nextDue ? t('plans.next', { date: dateMedium(plan.nextDue.dueDate, lang), amount: sar(plan.nextDue.amount, lang) }) : t(`plan.status.${plan.status}`)}
          </span>
        </div>
      </Link>
    </li>
  );
}

export default function Plans() {
  const { t, lang } = useI18n();
  const { query } = useLocation();
  const user = useRequireUser('/plans');
  const shopper = user?.role === 'shopper';
  const tab: Tab = query.get('tab') === 'completed' ? 'completed' : query.get('tab') === 'all' ? 'all' : 'active';
  const lateOnly = query.get('late') === '1';
  usePageMeta(t('plans.title'), t('app.name'));

  const plans = useQuery(shopper ? `plans:${user.id}` : null, () => api.plans.list(), { refetchMs: 30_000 });
  const limit = useQuery(shopper ? `limit:${user.id}` : null, () => api.me.limit());
  const upcoming = useQuery(shopper ? `upcoming:${user.id}` : null, () => api.me.upcoming(), { refetchMs: 30_000 });

  useAutopaySync(plans.data ? plans.data.reduce((a, pl) => a + pl.payments.filter((x) => x.status === 'paid').length, 0) : null);

  if (user && !shopper) return <WrongRole need="shopper" />;

  const all = plans.data ?? [];
  const lateCount = all.filter(isLatePlan).length;
  const shown = all.filter((pl) => (tab === 'all' ? true : tab === 'active' ? pl.status === 'active' : pl.status !== 'active') && (!lateOnly || isLatePlan(pl)));
  const info = limit.data;
  const approved = info?.status === 'approved';
  const up = upcoming.data;
  const next: UpcomingItem | undefined = up ? (up.overdue[0] ?? up.groups[0]?.items[0]) : undefined;
  const month = monthKey(today());
  const dueMonth = up ? round2(up.overdue.reduce((a, x) => a + x.amount, 0) + up.groups.filter((g) => monthKey(g.date) === month).reduce((a, g) => a + g.total, 0)) : 0;
  const tabs: [Tab, string][] = [
    ['active', t('plans.tab.active')],
    ['completed', t('plans.tab.completed')],
    ['all', t('plans.tab.all')],
  ];

  return (
    <div className={`container ${p.page}`}>
      <div className={p.head}>
        <h1>{t('plans.title')}</h1>
      </div>

      <section className={p.summary} aria-label={t('plans.summary')}>
        {limit.status === 'loading' || !info ? (
          limit.status === 'error' ? (
            <ErrorState error={limit.error} onRetry={limit.refetch} compact />
          ) : (
            <>
              <Skeleton w={132} h={132} r={66} />
              <div className={p.summaryMain}>
                <Skeleton w="60%" h={18} />
                <Skeleton h={64} r={14} />
              </div>
            </>
          )
        ) : !approved ? (
          <div style={{ gridColumn: '1 / -1' }} className={p.summaryMain}>
            <b>{t('plans.noLimit.title')}</b>
            <span className={p.muted}>{t(info.status === 'pending' ? 'plans.noLimit.pending' : 'plans.noLimit.body')}</span>
            <Link to="/verify" className={`${ui.btn} ${ui.primary} ${ui.md}`} style={{ width: 'fit-content' }}>
              {t(info.status === 'pending' ? 'pay.elig.check' : 'pay.elig.cta')}
            </Link>
          </div>
        ) : (
          <>
            <div className={p.summaryRing}>
              <LimitRing used={info.used} limit={info.limit}>
                <b className="num" aria-live="polite">
                  {amount(info.available, lang)}
                </b>
                <small>{t('plans.available')}</small>
              </LimitRing>
              <small>{t('plans.limitOf', { used: amount(info.used, lang), limit: sar(info.limit, lang) })}</small>
            </div>
            <div className={p.summaryMain}>
              {next ? (
                <div className={`${p.nextPay} ${next.status !== 'upcoming' ? p.nextLate : ''}`}>
                  <div>
                    <small>{next.status === 'late' ? t('plans.next.late') : t('plans.next.title')}</small>
                    <b className="num">{sar(next.amount, lang)}</b>
                    <small>
                      {dateMedium(next.dueDate, lang)} · {relDays(next.dueDate, t)}
                    </small>
                  </div>
                  <Button size="sm" onClick={() => navigate(`/plans/${next.planId}?pay=${next.n}`)}>
                    {t('plans.payNow')}
                  </Button>
                </div>
              ) : (
                <p className={p.muted}>{upcoming.status === 'loading' ? t('common.loading') : t('plans.next.none')}</p>
              )}
              <div className={p.stats}>
                <div>
                  <small>{t('plans.dueMonth')}</small>
                  <b className="num">{sar(dueMonth, lang)}</b>
                </div>
                {info.nextIncrease && (
                  <div>
                    <small>{t('plans.nextIncrease')}</small>
                    <b>{t('plans.nextIncrease.value', { n: info.nextIncrease.plansLeft, amount: sar(info.nextIncrease.newLimit, lang) })}</b>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      <div className={p.row}>
        <div className={p.tabs} role="tablist" aria-label={t('plans.title')} onKeyDown={tabKeyHandler(tabs.map(([k]) => k), tab, (k) => setQuery({ tab: k === 'active' ? null : k }), lang === 'ar')}>
          {tabs.map(([k, label]) => (
            <button key={k} role="tab" id={`tab-${k}`} aria-selected={tab === k} aria-controls="plans-panel" tabIndex={tab === k ? 0 : -1} onClick={() => setQuery({ tab: k === 'active' ? null : k })}>
              {label}
            </button>
          ))}
        </div>
        {lateCount > 0 && (
          <button className={p.chip} aria-pressed={lateOnly} onClick={() => setQuery({ late: lateOnly ? null : '1' })}>
            {t('plans.filter.late')} <span className={p.count}>{lateCount}</span>
          </button>
        )}
      </div>

      <div id="plans-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {plans.status === 'error' && !plans.data ? (
          <ErrorState error={plans.error} onRetry={plans.refetch} />
        ) : plans.status === 'loading' ? (
          <ul className={p.planList}>
            {[0, 1, 2].map((i) => (
              <li key={i}>
                <div className={p.planRow} style={{ animation: 'none' }}>
                  <Skeleton w={48} h={48} r={14} />
                  <div className={p.planRowMain}>
                    <Skeleton w="70%" h={16} />
                    <Skeleton w="45%" h={12} />
                  </div>
                  <Skeleton w={56} h={20} />
                  <div className={p.planRowBar}>
                    <Skeleton h={8} r={99} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : shown.length === 0 ? (
          <EmptyState
            art={<Icon name="receipt" size={64} />}
            title={t(lateOnly ? 'plans.empty.late' : tab === 'completed' ? 'plans.empty.completed' : 'plans.empty.title')}
            body={t('plans.empty.body')}
            action={
              <Link to="/stores" className={`${ui.btn} ${ui.primary} ${ui.md}`}>
                {t('plans.empty.cta')}
              </Link>
            }
          />
        ) : (
          <ul className={p.planList} aria-live="polite">
            {shown.map((pl, i) => (
              <PlanRow key={pl.id} plan={pl} i={i} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
