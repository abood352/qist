import { sar } from '@pf/core/format';
import { useI18n } from '@pf/core/react/i18n';
import { useQuery } from '@pf/core/react/query';
import { api } from '../../api/services';
import { Icon } from '../../components/Icon';
import { Badge, EmptyState, ErrorState, Skeleton } from '../../components/ui';
import { dateFull, dateMedium, relDays } from '../../lib/fmt';
import m from './merchant.module.css';
import p from '../pages.module.css';

export default function Settlements({ uid }: { uid: string }) {
  const { t, lang } = useI18n();
  const res = useQuery(`msettle:${uid}`, () => api.merchant.settlements(), { refetchMs: 30_000 });
  const d = res.data;

  if (res.status === 'error' && !d) return <ErrorState error={res.error} onRetry={res.refetch} />;
  return (
    <>
      <div className={m.settleHero} aria-live="polite">
        {d ? (
          <>
            <div className={`${m.kpi} ${m.kpiAccent}`}>
              <span>{t('merchant.settle.pending')}</span>
              <b className="num">{sar(d.pending, lang)}</b>
              <small>{d.nextDate ? t('merchant.settle.next', { date: dateFull(d.nextDate, lang) }) : t('merchant.kpi.pending.none')}</small>
            </div>
            <div className={m.kpi}>
              <span>{t('merchant.settle.paid')}</span>
              <b className="num">{sar(d.paid, lang)}</b>
              <small>{t('merchant.settle.paid.sub')}</small>
            </div>
          </>
        ) : (
          <>
            <Skeleton h={104} r={20} />
            <Skeleton h={104} r={20} />
          </>
        )}
      </div>

      <div className={`${p.alert} ${p.alert_info}`}>
        <Icon name="info" size={20} />
        <div>
          <b>{t('merchant.settle.how.title')}</b>
          <span>{t('merchant.settle.how.body')}</span>
        </div>
      </div>

      {!d ? (
        <Skeleton h={220} r={20} />
      ) : d.batches.length === 0 ? (
        <EmptyState art={<Icon name="cash" size={64} />} title={t('merchant.settle.empty')} />
      ) : (
        <div className={m.tableWrap}>
          <table className={m.table}>
            <caption className="sr-only">{t('merchant.nav.settlements')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('merchant.col.date')}</th>
                <th scope="col">{t('merchant.col.status')}</th>
                <th scope="col" className={m.num}>
                  {t('merchant.col.orders')}
                </th>
                <th scope="col" className={m.num}>
                  {t('merchant.col.gross')}
                </th>
                <th scope="col" className={m.num}>
                  {t('merchant.col.fee')}
                </th>
                <th scope="col" className={m.num}>
                  {t('merchant.col.net')}
                </th>
              </tr>
            </thead>
            <tbody>
              {d.batches.map((b) => (
                <tr key={b.date}>
                  <td data-l={t('merchant.col.date')}>
                    {dateMedium(b.date, lang)}
                    <small className={p.muted}> · {relDays(b.date, t)}</small>
                  </td>
                  <td data-l={t('merchant.col.status')}>
                    <Badge tone={b.status === 'paid' ? 'green' : 'warn'}>{t(`merchant.settle.${b.status}`)}</Badge>
                  </td>
                  <td data-l={t('merchant.col.orders')} className={`${m.num} num`}>
                    {b.orders}
                  </td>
                  <td data-l={t('merchant.col.gross')} className={`${m.num} num`}>
                    {sar(b.gross, lang)}
                  </td>
                  <td data-l={t('merchant.col.fee')} className={`${m.num} num`}>
                    − {sar(b.fee, lang)}
                  </td>
                  <td data-l={t('merchant.col.net')} className={`${m.num} num`}>
                    <b>{sar(b.net, lang)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
