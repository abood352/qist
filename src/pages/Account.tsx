import { sar } from '@pf/core/format';
import { useI18n } from '@pf/core/react/i18n';
import { invalidate, useQuery } from '@pf/core/react/query';
import { Link, navigate, usePageMeta } from '@pf/core/react/router';
import { toast } from '@pf/core/react/toast';
import { useState } from 'react';
import { api } from '../api/services';
import { today } from '../api/util';
import { Icon, type IconName } from '../components/Icon';
import { Badge, Button, Skeleton } from '../components/ui';
import { dateFull } from '../lib/fmt';
import { useRequireUser } from '../state/guard';
import { session } from '../state/session';
import p from './pages.module.css';

export default function Account() {
  const { t, lang } = useI18n();
  const user = useRequireUser('/account');
  const shopper = user?.role === 'shopper';
  const limit = useQuery(shopper ? `limit:${user.id}` : null, () => api.me.limit());
  const [busy, setBusy] = useState(false);
  usePageMeta(t('account.title'), t('app.name'));
  if (!user) return null;

  const info = limit.data;
  const tone = info?.status === 'approved' ? 'green' : info?.status === 'pending' ? 'warn' : info?.status === 'declined' ? 'danger' : 'neutral';
  const links: [string, IconName, string][] = shopper
    ? [
        ['/plans', 'receipt', t('nav.plans')],
        ['/upcoming', 'calendar', t('nav.upcoming')],
        ['/wallet', 'card', t('nav.wallet')],
        ['/verify', 'shield-check', t('account.verify')],
      ]
    : [
        ['/merchant', 'chart', t('nav.merchant')],
        ['/merchant/orders', 'receipt', t('merchant.nav.orders')],
        ['/merchant/settlements', 'cash', t('merchant.nav.settlements')],
      ];

  return (
    <div className={p.mid}>
      <div className={p.row} style={{ gap: 16 }}>
        <span className={p.avatar} aria-hidden="true">
          {user.name.slice(0, 1)}
        </span>
        <div className={p.head}>
          <h1>{user.name}</h1>
          <p className="ltr" style={{ textAlign: 'start' }}>
            {user.phone}
          </p>
        </div>
      </div>

      {shopper && (
        <section className={p.card} aria-labelledby="acc-limit">
          <div className={p.cardHead}>
            <h2 id="acc-limit">{t('account.limit')}</h2>
            {info && <Badge tone={tone}>{t(`account.status.${info.status}`)}</Badge>}
          </div>
          {!info ? (
            <Skeleton h={56} r={14} />
          ) : info.status === 'approved' ? (
            <>
              <div className={p.bigNum} aria-live="polite">
                <span className="num">{sar(info.available, lang)}</span>
                <small>{t('account.available', { limit: sar(info.limit, lang) })}</small>
              </div>
              {info.nextIncrease && <p className={p.muted}>{t('account.increase', { n: info.nextIncrease.plansLeft, newLimit: sar(info.nextIncrease.newLimit, lang) })}</p>}
            </>
          ) : (
            <>
              <p className={p.muted}>
                {info.status === 'declined' && info.retryAfter ? t('account.declined', { date: dateFull(info.retryAfter, lang) }) : t(`account.body.${info.status}`)}
              </p>
              {info.status !== 'declined' || !info.retryAfter || info.retryAfter <= today() ? (
                <Link to="/verify" className={`${p.chip}`} style={{ width: 'fit-content' }}>
                  {t('pay.elig.cta')}
                </Link>
              ) : null}
            </>
          )}
        </section>
      )}

      <ul className={p.links}>
        {links.map(([to, icon, label]) => (
          <li key={to}>
            <Link to={to}>
              <Icon name={icon} size={20} />
              <span>{label}</span>
              <Icon name="chevron-end" size={18} />
            </Link>
          </li>
        ))}
      </ul>

      <div>
        <Button
          variant="outline"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            await session.logout();
            invalidate('');
            toast(t('account.signedOut'));
            navigate('/', { replace: true });
          }}
        >
          <Icon name="logout" size={18} /> {t('auth.logout')}
        </Button>
      </div>
    </div>
  );
}
