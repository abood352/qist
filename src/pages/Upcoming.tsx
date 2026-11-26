import { sar } from '@pf/core/format';
import type { ApiError } from '@pf/core/http';
import { useI18n } from '@pf/core/react/i18n';
import { invalidate, useQuery } from '@pf/core/react/query';
import { Link, usePageMeta } from '@pf/core/react/router';
import { toast } from '@pf/core/react/toast';
import { useState } from 'react';
import { api } from '../api/services';
import type { Upcoming as UpcomingT, UpcomingItem } from '../api/types';
import { addDays, round2, today } from '../api/util';
import { WrongRole } from '../components/Gate';
import { Icon } from '../components/Icon';
import { MethodSelect, resolveMethod, StatusChip, StoreLogo } from '../components/Qist';
import { Button, Dialog, EmptyState, ErrorState, Skeleton, ui } from '../components/ui';
import { dateShort, dayNumber, errText, relDays, weekdayShort, weekStart } from '../lib/fmt';
import { useAutopaySync } from '../lib/hooks';
import { useRequireUser } from '../state/guard';
import p from './pages.module.css';

function Item({ it, overdue }: { it: UpcomingItem; overdue?: boolean }) {
  const { t, l, lang } = useI18n();
  return (
    <Link to={`/plans/${it.planId}?pay=${it.n}`} className={`${p.payItem} ${overdue ? p.overdue : ''}`}>
      <StoreLogo store={it.store} size={36} />
      <div>
        <b>{l(it.store.name)}</b>
        <small>
          <span className="ltr">{it.code}</span> · {t('plan.instalment', { n: it.n, of: it.of })}
          {it.autopay && ` · ${t('upcoming.auto')}`}
        </small>
        {overdue && <small>{relDays(it.dueDate, t)}</small>}
      </div>
      <div style={{ textAlign: 'end', display: 'grid', justifyItems: 'end', gap: 4 }}>
        <b className="num" style={{ fontFamily: 'var(--font-display)' }}>
          {sar(it.amount, lang)}
        </b>
        {it.status !== 'upcoming' && <StatusChip status={it.status} />}
      </div>
    </Link>
  );
}

function PayAll({ items, total, uid, onClose }: { items: UpcomingItem[]; total: number; uid: string; onClose: () => void }) {
  const { t, lang } = useI18n();
  const cards = useQuery(`cards:${uid}`, () => api.me.cards());
  const [chosen, setChosen] = useState<string | null>(null);
  const method = resolveMethod(cards.data, chosen);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState('');

  const run = async () => {
    if (!method || method === 'new') return;
    setBusy(true);
    setErr('');
    let done = 0;
    try {
      // oldest first, and in instalment order within a plan (the API enforces it)
      for (const it of [...items].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.n - b.n)) {
        await api.plans.pay(it.planId, it.n, method);
        setProgress(++done);
      }
      toast(t('upcoming.paidAll', { n: done }));
      onClose();
    } catch (e) {
      setErr(`${t('upcoming.partial', { done, total: items.length })} ${errText(e as ApiError, t)}`);
    } finally {
      setBusy(false);
      invalidate('upcoming');
      invalidate('plan');
      invalidate('limit');
    }
  };

  return (
    <Dialog open onClose={onClose} title={t('upcoming.payAll.title')}>
      <div className={p.skelRow} style={{ gap: 16 }}>
        <dl className={p.kv}>
          <div>
            <dt>{t('upcoming.payAll.count')}</dt>
            <dd className="num">{items.length}</dd>
          </div>
          <div className={p.kvTotal}>
            <dt>{t('plan.settle.amount')}</dt>
            <dd className="num">{sar(total, lang)}</dd>
          </div>
        </dl>
        {cards.status === 'loading' ? <Skeleton h={56} r={14} /> : <MethodSelect cards={cards.data ?? []} value={method} onChange={setChosen} legend={t('pay.s.method')} />}
        {busy && (
          <p className={p.muted} role="status" aria-live="polite">
            {t('upcoming.progress', { done: progress, total: items.length })}
          </p>
        )}
        {err && (
          <p className={p.formError} role="alert">
            {err}
          </p>
        )}
        <Button size="lg" block loading={busy} disabled={!method || method === 'new'} onClick={run}>
          {t('plan.pay.confirm', { amount: sar(total, lang) })}
        </Button>
      </div>
    </Dialog>
  );
}

export default function Upcoming() {
  const { t, lang } = useI18n();
  const user = useRequireUser('/upcoming');
  const shopper = user?.role === 'shopper';
  const res = useQuery<UpcomingT>(shopper ? `upcoming:${user.id}` : null, () => api.me.upcoming(), { refetchMs: 30_000 });
  const [paying, setPaying] = useState(false);
  usePageMeta(t('upcoming.title'), t('app.name'));
  useAutopaySync(res.data ? res.data.overdue.length + res.data.groups.reduce((a, g) => a + g.items.length, 0) : null);
  if (user && !shopper) return <WrongRole need="shopper" />;

  const data = res.data;
  const overdueTotal = data ? round2(data.overdue.reduce((a, x) => a + x.amount, 0)) : 0;
  const thisWeek = weekStart(today());
  const weeks = new Map<string, { total: number; days: UpcomingT['groups'] }>();
  for (const g of data?.groups ?? []) {
    const k = weekStart(g.date);
    const w = weeks.get(k) ?? { total: 0, days: [] };
    w.total = round2(w.total + g.total);
    w.days.push(g);
    weeks.set(k, w);
  }
  const empty = data && !data.overdue.length && !data.groups.length;

  return (
    <div className={p.mid}>
      <div className={p.head}>
        <h1>{t('upcoming.title')}</h1>
        <p>{t('upcoming.sub')}</p>
      </div>

      {res.status === 'error' && !data ? (
        <ErrorState error={res.error} onRetry={res.refetch} />
      ) : !data ? (
        <div className={p.skelRow}>
          <Skeleton h={64} r={16} />
          <Skeleton h={64} r={16} />
          <Skeleton h={64} r={16} />
        </div>
      ) : empty ? (
        <EmptyState
          art={<Icon name="calendar" size={64} />}
          title={t('upcoming.empty.title')}
          body={t('upcoming.empty.body')}
          action={
            <Link to="/stores" className={`${ui.btn} ${ui.primary} ${ui.md}`}>
              {t('plans.empty.cta')}
            </Link>
          }
        />
      ) : (
        <>
          <div className={p.stats}>
            <div>
              <small>{t('upcoming.total')}</small>
              <b className="num">{sar(data.total, lang)}</b>
            </div>
          </div>

          {data.overdue.length > 0 && (
            <section className={p.week} aria-labelledby="up-overdue">
              <div className={p.weekHead}>
                <b id="up-overdue" className={p.lateText}>
                  {t('upcoming.overdue')}
                </b>
                <span className="num">{sar(overdueTotal, lang)}</span>
              </div>
              <div className={p.dayItems}>
                {data.overdue.map((it) => (
                  <Item key={`${it.planId}-${it.n}`} it={it} overdue />
                ))}
              </div>
              <div>
                <Button onClick={() => setPaying(true)}>
                  <Icon name="bolt" size={16} /> {t('upcoming.payAll', { n: data.overdue.length })}
                </Button>
              </div>
            </section>
          )}

          {[...weeks.entries()].map(([start, w]) => (
            <section key={start} className={p.week} aria-label={t('upcoming.week', { from: dateShort(start, lang), to: dateShort(addDays(start, 6), lang) })}>
              <div className={p.weekHead}>
                <b>{start === thisWeek ? t('upcoming.thisWeek') : t('upcoming.week', { from: dateShort(start, lang), to: dateShort(addDays(start, 6), lang) })}</b>
                <span className="num">{sar(w.total, lang)}</span>
              </div>
              {w.days.map((g) => (
                <div key={g.date} className={p.dayRow}>
                  <div className={p.dayBadge}>
                    <small>{weekdayShort(g.date, lang)}</small>
                    <b className="num">{dayNumber(g.date, lang)}</b>
                  </div>
                  <div className={p.dayItems}>
                    {g.items.map((it) => (
                      <Item key={`${it.planId}-${it.n}`} it={it} />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </>
      )}
      {paying && data && <PayAll items={data.overdue} total={overdueTotal} uid={user!.id} onClose={() => setPaying(false)} />}
    </div>
  );
}
