import { useI18n } from '@pf/core/react/i18n';
import { useQuery } from '@pf/core/react/query';
import { Link, setQuery, useLocation, usePageMeta } from '@pf/core/react/router';
import { useState } from 'react';
import { api } from '../api/services';
import type { StoreCategory } from '../api/types';
import { normalize } from '../api/util';
import { Icon } from '../components/Icon';
import { StoreLogo } from '../components/Qist';
import { Badge, EmptyState, ErrorState, Skeleton } from '../components/ui';
import { useDebounced } from '../lib/hooks';
import p from './pages.module.css';

export const CATEGORIES: StoreCategory[] = ['fashion', 'electronics', 'home', 'beauty', 'kids', 'travel'];

export default function Stores() {
  const { t, l } = useI18n();
  const { query } = useLocation();
  const cat = (CATEGORIES as string[]).includes(query.get('cat') ?? '') ? (query.get('cat') as StoreCategory) : undefined;
  const [text, setText] = useState(query.get('q') ?? '');
  const needle = useDebounced(text, 200);
  usePageMeta(t('stores.title'), t('app.name'));
  const res = useQuery(`stores:${cat ?? 'all'}`, () => api.stores.list(cat), { staleMs: 120_000 });
  const tokens = normalize(needle).split(' ').filter(Boolean);
  const list = (res.data ?? []).filter((s) => {
    if (!tokens.length) return true;
    const hay = normalize([s.name.ar, s.name.en, s.tagline.ar, s.tagline.en].join(' '));
    return tokens.every((x) => hay.includes(x));
  });

  return (
    <div className={`container ${p.page}`}>
      <div className={p.head}>
        <h1>{t('stores.title')}</h1>
        <p>{t('stores.sub')}</p>
      </div>
      <div className={p.toolbar}>
        <label className={p.search}>
          <span className="sr-only">{t('stores.search')}</span>
          <Icon name="search" size={18} />
          <input
            type="search"
            value={text}
            placeholder={t('stores.search')}
            onChange={(e) => {
              setText(e.target.value);
              setQuery({ q: e.target.value || null });
            }}
          />
        </label>
      </div>
      <div className={p.chips} role="group" aria-label={t('stores.categories')}>
        <button className={p.chip} aria-pressed={!cat} onClick={() => setQuery({ cat: null })}>
          {t('common.any')}
        </button>
        {CATEGORIES.map((c) => (
          <button key={c} className={p.chip} aria-pressed={cat === c} onClick={() => setQuery({ cat: c })}>
            {t(`cat.${c}`)}
          </button>
        ))}
      </div>
      <div aria-live="polite" className="sr-only">
        {res.data ? t('plural.stores', { n: list.length }) : ''}
      </div>
      {res.status === 'error' ? (
        <ErrorState error={res.error} onRetry={res.refetch} />
      ) : res.status === 'loading' ? (
        <div className={p.storeGrid}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={p.storeCard} style={{ animation: 'none' }}>
              <Skeleton w={48} h={48} r={14} />
              <Skeleton w="60%" h={18} />
              <Skeleton h={14} />
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState art={<Icon name="search" size={64} />} title={t('stores.empty.title')} body={t('stores.empty.body')} />
      ) : (
        <ul className={p.storeGrid} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {list.map((s, i) => (
            <li key={s.id} style={{ display: 'contents' }}>
              <Link to={`/stores/${s.id}`} className={p.storeCard} style={{ ['--i' as string]: i }}>
                <div className={p.storeTop}>
                  <StoreLogo store={s} size={48} />
                  <div>
                    <h3>{l(s.name)}</h3>
                    <small className={p.muted}>{t('plural.products', { n: s.products })}</small>
                  </div>
                </div>
                <p>{l(s.tagline)}</p>
                <div className={p.chips}>
                  {s.categories.map((c) => (
                    <Badge key={c}>{t(`cat.${c}`)}</Badge>
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
