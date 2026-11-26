import { amount } from '@pf/core/format';
import { useI18n } from '@pf/core/react/i18n';
import { useQuery } from '@pf/core/react/query';
import { Link, setQuery, useLocation, usePageMeta } from '@pf/core/react/router';
import { useState } from 'react';
import { schedule } from '../api/plans';
import { api } from '../api/services';
import type { ProductListItem, StoreDetail } from '../api/types';
import { Icon } from '../components/Icon';
import { inkOn, ProductArt, StoreLogo } from '../components/Qist';
import { EmptyState, ErrorState, Pagination, Skeleton } from '../components/ui';
import { useDebounced } from '../lib/hooks';
import { hasPay4 } from '../lib/fmt';
import p from './pages.module.css';

const LIMIT = 6;

/** a product's art follows the store's categories (stores with two categories alternate) */
export const categoryOf = (store: Pick<StoreDetail, 'categories'>, productId: string) => store.categories[(Number(/-p(\d+)$/.exec(productId)?.[1] ?? 1) - 1) % store.categories.length];

export function ProductCard({ product, store, i }: { product: ProductListItem; store: StoreDetail; i: number }) {
  const { t, l, lang } = useI18n();
  // amounts only (dates are irrelevant here), so a fixed start date keeps this free of "today"
  const first = hasPay4(product.price) ? schedule('pay4', product.price, '2000-01-01')[0].amount : null;
  return (
    <Link to={`/pay/${product.id}`} className={p.prod} style={{ ['--i' as string]: i }}>
      <div className={p.prodArt}>
        <ProductArt category={categoryOf(store, product.id)} palette={product.palette} />
      </div>
      <div className={p.prodBody}>
        <h3>{l(product.title)}</h3>
        <span className={p.prodPrice}>
          <span className="num">{amount(product.price, lang)}</span> <small>{t('common.sar')}</small>
        </span>
        {first !== null && (
          <span className={p.pay4}>
            {t('store.pay4', { amount: amount(first, lang), sar: t('common.sar') })}
          </span>
        )}
      </div>
    </Link>
  );
}

export default function Store({ params }: { params: { id: string } }) {
  const { t, l } = useI18n();
  const { query } = useLocation();
  const sort = query.get('sort') === 'price_asc' ? 'price_asc' : query.get('sort') === 'price_desc' ? 'price_desc' : undefined;
  const page = Math.max(1, Number(query.get('page')) || 1);
  const [text, setText] = useState(query.get('q') ?? '');
  const needle = useDebounced(text, 250);
  const store = useQuery(`store:${params.id}`, () => api.stores.get(params.id), { staleMs: 120_000 });
  const products = useQuery(`products:${params.id}:${sort ?? ''}:${page}:${needle}`, () => api.stores.products({ store: params.id, sort, page, limit: LIMIT, q: needle }));
  usePageMeta(store.data ? l(store.data.name) : t('nav.stores'), t('app.name'));

  if (store.status === 'error')
    return (
      <div className={`container ${p.page}`}>
        {store.error?.code === 'STORE_NOT_FOUND' ? (
          <EmptyState art={<Icon name="store" size={64} />} title={t('store.notFound')} action={<Link to="/stores" className={p.back}>{t('store.all')}</Link>} />
        ) : (
          <ErrorState error={store.error} onRetry={store.refetch} />
        )}
      </div>
    );

  const s = store.data;
  return (
    <div className={`container ${p.page}`}>
      <Link to="/stores" className={p.back}>
        <Icon name="chevron-start" size={18} /> {t('store.all')}
      </Link>
      {s ? (
        <header className={p.storeHero} style={{ background: s.palette[0], color: inkOn(s.palette[0]) }}>
          <StoreLogo store={s} size={64} />
          <div>
            <h1>{l(s.name)}</h1>
            <p>{l(s.tagline)}</p>
          </div>
        </header>
      ) : (
        <Skeleton h={112} r={22} />
      )}
      <div className={p.toolbar}>
        <label className={p.search}>
          <span className="sr-only">{t('store.search')}</span>
          <Icon name="search" size={18} />
          <input
            type="search"
            value={text}
            placeholder={t('store.search')}
            onChange={(e) => {
              setText(e.target.value);
              setQuery({ q: e.target.value || null, page: null });
            }}
          />
        </label>
        <label>
          <span className="sr-only">{t('store.sort')}</span>
          <select className={p.select} value={sort ?? ''} onChange={(e) => setQuery({ sort: e.target.value || null, page: null })}>
            <option value="">{t('store.sort.default')}</option>
            <option value="price_asc">{t('store.sort.asc')}</option>
            <option value="price_desc">{t('store.sort.desc')}</option>
          </select>
        </label>
      </div>
      {products.status === 'error' ? (
        <ErrorState error={products.error} onRetry={products.refetch} />
      ) : products.status === 'loading' || !s ? (
        <div className={p.prodGrid}>
          {Array.from({ length: LIMIT }, (_, i) => (
            <div key={i} className={p.prod} style={{ animation: 'none' }}>
              <Skeleton h={150} r={0} />
              <div className={p.prodBody}>
                <Skeleton w="80%" h={16} />
                <Skeleton w="40%" h={18} />
              </div>
            </div>
          ))}
        </div>
      ) : products.data!.items.length === 0 ? (
        <EmptyState art={<Icon name="search" size={64} />} title={t('store.empty.title')} body={t('store.empty.body')} />
      ) : (
        <>
          <div className={p.prodGrid} aria-live="polite">
            {products.data!.items.map((x, i) => (
              <ProductCard key={x.id} product={x} store={s} i={i} />
            ))}
          </div>
          <Pagination page={products.data!.page} pages={products.data!.pages} onPage={(n) => setQuery({ page: n })} />
        </>
      )}
    </div>
  );
}
