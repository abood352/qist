import { I18nProvider, useI18n } from '@pf/core/react/i18n';
import { lazyPage } from '@pf/core/react/lazyPage';
import { matchPath, useLocation } from '@pf/core/react/router';
import { Component, Suspense, useEffect, type ComponentType, type ReactNode } from 'react';
import { DevPanel } from './components/DevPanel';
import { Footer, Header, TabBar } from './components/Shell';
import { ErrorState, Toaster } from './components/ui';
import { ar } from './i18n/ar';
import { en } from './i18n/en';
import { PageFallback } from './pages/PageFallback';
import { session } from './state/session';

const dicts = { ar, en };

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each page declares the params it reads
type Page = ReturnType<typeof lazyPage<ComponentType<{ params: any }>>>;

/** Every page is its own chunk; the first screen's chunk is preloaded before render (main.tsx). */
const pages = {
  home: lazyPage(() => import('./pages/Home')),
  stores: lazyPage(() => import('./pages/Stores')),
  store: lazyPage(() => import('./pages/Store')),
  pay: lazyPage(() => import('./pages/Pay')),
  verify: lazyPage(() => import('./pages/Verify')),
  plans: lazyPage(() => import('./pages/Plans')),
  plan: lazyPage(() => import('./pages/Plan')),
  upcoming: lazyPage(() => import('./pages/Upcoming')),
  wallet: lazyPage(() => import('./pages/Wallet')),
  auth: lazyPage(() => import('./pages/Auth')),
  account: lazyPage(() => import('./pages/Account')),
  merchant: lazyPage(() => import('./pages/merchant/Merchant')),
  notFound: lazyPage(() => import('./pages/NotFound')),
} satisfies Record<string, Page>;

const routes: [string, Page][] = [
  ['/', pages.home],
  ['/stores', pages.stores],
  ['/stores/:id', pages.store],
  ['/pay/:productId', pages.pay],
  ['/verify', pages.verify],
  ['/plans', pages.plans],
  ['/plans/:id', pages.plan],
  ['/upcoming', pages.upcoming],
  ['/wallet', pages.wallet],
  ['/login', pages.auth],
  ['/account', pages.account],
  ['/merchant', pages.merchant],
  ['/merchant/:section', pages.merchant],
];

export function resolve(path: string) {
  for (const [pattern, page] of routes) {
    const params = matchPath(pattern, path);
    if (params) return { page, params: { ...params, path } };
  }
  return { page: pages.notFound, params: { path } };
}

/** A page chunk that fails to load (offline) shows a retry instead of a blank screen. */
class PageBoundary extends Component<{ children: ReactNode; path: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(prev: { path: string }) {
    if (prev.path !== this.props.path && this.state.failed) this.setState({ failed: false });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="container" style={{ paddingBlock: 48 }}>
        <ErrorState onRetry={() => location.reload()} />
      </div>
    );
  }
}

function Shell() {
  const { path } = useLocation();
  const { t } = useI18n();
  const { page: Page, params } = resolve(path);
  const isMerchant = path.startsWith('/merchant');
  const isPay = path.startsWith('/pay/');
  // the store list and the merchant dashboard keep their state while only the query / section changes
  const key = path === '/stores' || isMerchant ? undefined : path;

  useEffect(() => {
    session.refresh();
  }, []);

  return (
    <>
      <a href="#main" className="sr-only" onClick={(e) => (e.preventDefault(), document.getElementById('main')?.focus())}>
        {t('skip')}
      </a>
      <Header />
      <main id="main" tabIndex={-1} style={{ outline: 'none' }}>
        <PageBoundary path={path}>
          <Suspense fallback={<PageFallback />}>
            <Page key={key} params={params} />
          </Suspense>
        </PageBoundary>
      </main>
      {!isMerchant && !isPay && <Footer />}
      <TabBar />
      <Toaster />
      <DevPanel />
    </>
  );
}

export function App() {
  return (
    <I18nProvider dicts={dicts} storageKey="qist-lang">
      <Shell />
    </I18nProvider>
  );
}
