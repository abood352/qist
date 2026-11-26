import { amount, sar } from '@pf/core/format';
import { useI18n } from '@pf/core/react/i18n';
import { useQuery } from '@pf/core/react/query';
import { Link } from '@pf/core/react/router';
import { PLANS } from '../../api/plans';
import { api } from '../../api/services';
import type { MerchantStats } from '../../api/types';
import { Icon } from '../../components/Icon';
import { Badge, EmptyState, ErrorState, Skeleton } from '../../components/ui';
import { dateShort, dayNumber } from '../../lib/fmt';
import { orderState } from './shared';
import m from './merchant.module.css';
import p from '../pages.module.css';

export default function Overview({ stats, uid }: { stats: MerchantStats | undefined; uid: string }) {
  const { t, l, lang } = useI18n();
  const recent = useQuery(`morders:${uid}:recent`, () => api.merchant.orders({ page: 1 }), { refetchMs: 15_000 });
  const days = stats?.series.slice(-14) ?? [];
  const max = Math.max(1, ...days.map((d) => d.sales));
  const mixTotal = Math.max(1, stats?.planMix.reduce((a, x) => a + x.orders, 0) ?? 1);

  const tiles: [string, string, string | undefined, boolean?][] = stats
    ? [
        [t('merchant.kpi.sales'), sar(stats.sales, lang), t('merchant.kpi.sales.sub', { n: stats.orders }), true],
        [t('merchant.kpi.today'), String(stats.ordersToday), t('merchant.kpi.today.sub', { amount: sar(stats.salesToday, lang) })],
        [t('merchant.kpi.avg'), sar(stats.avgOrderValue, lang), t('merchant.kpi.avg.sub')],
        [t('merchant.kpi.pending'), sar(stats.pendingSettlement, lang), stats.nextSettlement ? t('merchant.kpi.pending.sub', { date: dateShort(stats.nextSettlement, lang) }) : t('merchant.kpi.pending.none')],
      ]
    : [];

  return (
    <>
      <div className={m.kpis} aria-live="polite">
        {stats
          ? tiles.map(([label, value, sub, accent], i) => (
              <div key={label} className={`${m.kpi} ${accent ? m.kpiAccent : ''}`} style={{ ['--i' as string]: i }}>
                <span>{label}</span>
                <b className="num">{value}</b>
                <small>{sub}</small>
              </div>
            ))
          : [0, 1, 2, 3].map((i) => <Skeleton key={i} h={104} r={20} />)}
      </div>

      <div className={m.two}>
        <section className={p.card} aria-labelledby="m-chart">
          <div className={p.cardHead}>
            <h2 id="m-chart">{t('merchant.chart.title')}</h2>
            {stats && <Badge tone="green">{t('merchant.uplift', { n: stats.conversionUplift })}</Badge>}
          </div>
          {stats ? (
            <>
              <ol className={m.bars} aria-label={t('merchant.chart.title')}>
                {days.map((d, i) => (
                  <li key={d.date} style={{ ['--i' as string]: i }} title={`${dateShort(d.date, lang)}: ${sar(d.sales, lang)}`}>
                    <i style={{ height: `${Math.max(2, (d.sales / max) * 100)}%` }} />
                    <span className="sr-only">
                      {dateShort(d.date, lang)}: {sar(d.sales, lang)}
                    </span>
                  </li>
                ))}
              </ol>
              <ol className={m.barDays} aria-hidden="true">
                {days.map((d) => (
                  <li key={d.date} className="num">
                    {dayNumber(d.date, lang)}
                  </li>
                ))}
              </ol>
              <small className={p.muted}>{t('merchant.chart.note', { max: sar(max, lang) })}</small>
            </>
          ) : (
            <Skeleton h={200} r={14} />
          )}
        </section>

        <section className={p.card} aria-labelledby="m-mix">
          <h2 id="m-mix">{t('merchant.mix.title')}</h2>
          {stats ? (
            <ul className={m.mix}>
              {stats.planMix.map((x) => (
                <li key={x.plan}>
                  <div>
                    <span>{l(PLANS[x.plan].name)}</span>
                    <b className="num">{x.orders}</b>
                  </div>
                  <span>
                    <i style={{ width: `${(x.orders / mixTotal) * 100}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Skeleton h={120} r={14} />
          )}
        </section>
      </div>

      <section className={p.card} aria-labelledby="m-recent">
        <div className={p.cardHead}>
          <h2 id="m-recent">{t('merchant.recent')}</h2>
          <Link to="/merchant/orders" className={p.back}>
            {t('common.seeAll')} <Icon name="chevron-end" size={16} />
          </Link>
        </div>
        {recent.status === 'error' && !recent.data ? (
          <ErrorState error={recent.error} onRetry={recent.refetch} compact />
        ) : !recent.data ? (
          <Skeleton h={160} r={14} />
        ) : recent.data.items.length === 0 ? (
          <EmptyState art={<Icon name="receipt" size={56} />} title={t('merchant.orders.empty')} />
        ) : (
          <ul className={p.items}>
            {recent.data.items.slice(0, 5).map((o) => (
              <li key={o.id}>
                <Link to={`/merchant/orders?order=${o.id}`} className={p.row} style={{ flex: 1, justifyContent: 'space-between', minHeight: 44 }}>
                  <span>
                    <b className="ltr">{o.code}</b> <span className={p.muted}>· {o.customer}</span>
                  </span>
                  <span className={p.row} style={{ gap: 10 }}>
                    <Badge tone={orderState(o).tone}>{t(`plan.status.${orderState(o).key}`)}</Badge>
                    <b className="num">{amount(o.total - o.refunded, lang)}</b>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
