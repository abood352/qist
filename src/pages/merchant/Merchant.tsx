import { useI18n } from '@pf/core/react/i18n';
import { Link, usePageMeta } from '@pf/core/react/router';
import { useQuery } from '@pf/core/react/query';
import { api } from '../../api/services';
import { WrongRole } from '../../components/Gate';
import { Icon } from '../../components/Icon';
import { StoreLogo } from '../../components/Qist';
import { ErrorState, Skeleton } from '../../components/ui';
import { useRequireUser } from '../../state/guard';
import Orders from './Orders';
import Overview from './Overview';
import Settlements from './Settlements';
import m from './merchant.module.css';

const SECTIONS = ['overview', 'orders', 'settlements'] as const;
export type Section = (typeof SECTIONS)[number];

export default function Merchant({ params }: { params: { section?: string } }) {
  const { t, l } = useI18n();
  const user = useRequireUser(params.section ? `/merchant/${params.section}` : '/merchant');
  const isMerchant = user?.role === 'merchant';
  const section: Section = (SECTIONS as readonly string[]).includes(params.section ?? '') ? (params.section as Section) : 'overview';
  const stats = useQuery(isMerchant ? `mstats:${user.id}` : null, () => api.merchant.stats(), { refetchMs: 15_000 });
  usePageMeta(t(`merchant.nav.${section}`), t('app.name'));

  if (user && !isMerchant) return <WrongRole need="merchant" />;
  const icons = { overview: 'chart', orders: 'receipt', settlements: 'cash' } as const;

  return (
    <div className={`container ${m.page}`}>
      <div className={m.top}>
        {stats.data ? <StoreLogo store={stats.data.store} size={48} /> : <Skeleton w={48} h={48} r={14} />}
        <div>
          <h1>{stats.data ? l(stats.data.store.name) : t('nav.merchant')}</h1>
          <small>{t('merchant.sub')}</small>
        </div>
      </div>
      <nav className={m.nav} aria-label={t('nav.merchant')}>
        {SECTIONS.map((s) => (
          <Link key={s} to={s === 'overview' ? '/merchant' : `/merchant/${s}`} aria-current={section === s ? 'page' : undefined}>
            <Icon name={icons[s]} size={16} /> {t(`merchant.nav.${s}`)}
          </Link>
        ))}
      </nav>
      {stats.status === 'error' && !stats.data ? (
        <ErrorState error={stats.error} onRetry={stats.refetch} />
      ) : section === 'overview' ? (
        <Overview stats={stats.data} uid={user?.id ?? ''} />
      ) : section === 'orders' ? (
        <Orders uid={user?.id ?? ''} />
      ) : (
        <Settlements uid={user?.id ?? ''} />
      )}
    </div>
  );
}
