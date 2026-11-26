import { useI18n } from '@pf/core/react/i18n';
import { Link, useLocation } from '@pf/core/react/router';
import { useTheme } from '@pf/core/react/theme';
import { useEffect, useState } from 'react';
import { useUser } from '../state/session';
import { Icon, type IconName } from './Icon';
import { QistMark } from './Qist';
import s from './shell.module.css';

export function Brand() {
  const { t } = useI18n();
  return (
    <Link to="/" className={s.brand}>
      <QistMark size={38} />
      <span>
        <b>{t('app.name')}</b>
        <small>{t('app.tagline')}</small>
      </span>
    </Link>
  );
}

export function Header() {
  const { t, lang, setLang } = useI18n();
  const { theme, toggle } = useTheme('qist-theme', { light: '#f5f7f2', dark: '#0c1511' });
  const user = useUser();
  const { path } = useLocation();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  const merchant = user?.role === 'merchant';
  const cur = (on: boolean) => (on ? 'page' : undefined);
  return (
    <header className={`${s.header} ${scrolled ? s.scrolled : ''}`}>
      <div className={s.row}>
        <Brand />
        <nav className={s.nav} aria-label={t('nav.main')}>
          {!merchant && (
            <Link to="/stores" aria-current={cur(path.startsWith('/stores') || path.startsWith('/pay'))}>
              {t('nav.stores')}
            </Link>
          )}
          {user && !merchant && (
            <>
              <Link to="/plans" aria-current={cur(path.startsWith('/plans'))}>
                {t('nav.plans')}
              </Link>
              <Link to="/upcoming" aria-current={cur(path === '/upcoming')}>
                {t('nav.upcoming')}
              </Link>
              <Link to="/wallet" aria-current={cur(path === '/wallet')}>
                {t('nav.wallet')}
              </Link>
            </>
          )}
          {merchant && (
            <Link to="/merchant" className={s.merLink} aria-current={cur(path.startsWith('/merchant'))}>
              <Icon name="store" size={16} /> {t('nav.merchant')}
            </Link>
          )}
        </nav>
        <div className={s.actions}>
          <button className={s.iconBtn} onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} aria-label={t('nav.langLabel')} title={t('nav.langLabel')}>
            <b className={s.lang}>{lang === 'ar' ? 'EN' : 'ع'}</b>
          </button>
          <button className={s.iconBtn} onClick={toggle} aria-label={theme === 'dark' ? t('nav.theme.light') : t('nav.theme.dark')}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          {user ? (
            <Link to="/account" className={s.user}>
              <span aria-hidden="true">{user.name.slice(0, 1)}</span>
              <b>{user.name.split(' ')[0]}</b>
            </Link>
          ) : (
            <Link to="/login" className={s.login}>
              {t('nav.login')}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

/** Routes with their own bottom action bar (the checkout) hide the tab bar. */
export const hidesTabBar = (path: string) => path.startsWith('/pay/');

export function TabBar() {
  const { t } = useI18n();
  const { path } = useLocation();
  const user = useUser();
  if (hidesTabBar(path)) return null;
  const merchant = user?.role === 'merchant';
  const tabs: [string, IconName, string, boolean][] = [
    ['/', 'home', t('nav.home'), path === '/'],
    ...(merchant ? [] : ([['/stores', 'store', t('nav.stores'), path.startsWith('/stores')]] as [string, IconName, string, boolean][])),
    merchant ? ['/merchant', 'chart', t('nav.merchant'), path.startsWith('/merchant')] : user ? ['/plans', 'receipt', t('nav.plans'), path.startsWith('/plans') || path === '/upcoming'] : ['/verify', 'shield-check', t('nav.verify'), path === '/verify'],
    [user ? '/account' : '/login', 'user', user ? t('nav.account') : t('nav.login'), path === '/account' || path === '/login' || path === '/wallet'],
  ];
  return (
    <nav className={s.tabbar} aria-label={t('nav.main')}>
      {tabs.map(([to, icon, label, on]) => (
        <Link key={to} to={to} aria-current={on ? 'page' : undefined}>
          <Icon name={icon} size={22} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className={s.footer}>
      <div className={`container ${s.footerRow}`}>
        <Brand />
        <p>{t('footer.about')}</p>
        <a href="/">{t('footer.portfolio')} ↗</a>
      </div>
    </footer>
  );
}
