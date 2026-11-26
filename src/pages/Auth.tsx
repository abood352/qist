import { USE_MOCK } from '@pf/core/env';
import type { ApiError } from '@pf/core/http';
import { useI18n } from '@pf/core/react/i18n';
import { invalidate } from '@pf/core/react/query';
import { navigate, useLocation, usePageMeta } from '@pf/core/react/router';
import { toast } from '@pf/core/react/toast';
import { useEffect, useRef, useState } from 'react';
import type { User } from '../api/types';
import { Icon } from '../components/Icon';
import { Button, Field } from '../components/ui';
import { safeNext } from '../state/guard';
import { session } from '../state/session';
import p from './pages.module.css';

/** Phone → 4-digit code (→ name for new accounts). ?as=merchant highlights the merchant demo; ?next= returns afterwards. */
export default function Auth() {
  const { t } = useI18n();
  const { query } = useLocation();
  const next = safeNext(query.get('next')) ?? '';
  const asMerchant = query.get('as') === 'merchant';
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [req, setReq] = useState<{ requestId: string; devCode?: string; isNew: boolean } | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);
  usePageMeta(t('auth.title'), t('app.name'));

  useEffect(() => {
    if (!wait) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const done = (user: User) => {
    invalidate('');
    toast(t('auth.welcome', { name: user.name.split(' ')[0] }));
    navigate(next || (user.role === 'merchant' ? '/merchant' : '/'), { replace: true });
  };

  const send = async (num = phone) => {
    setError('');
    setBusy('send');
    try {
      const r = await session.requestOtp(num);
      setReq(r);
      setStep('code');
      setCode('');
      setWait(30);
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (e) {
      const ae = e as ApiError;
      setError(ae.details?.phone ? t('v.phone') : ae.code === 'RATE_LIMITED' ? t('auth.RATE_LIMITED') : t('error.title'));
    } finally {
      setBusy(null);
    }
  };

  const verify = async (c = code) => {
    if (!req) return;
    if (req.isNew && !name.trim()) return setError(t('v.REQUIRED'));
    setError('');
    setBusy('verify');
    try {
      done(await session.verify(req.requestId, c, name.trim() || undefined));
    } catch (e) {
      const ae = e as ApiError;
      const key = `auth.${ae.code}`;
      setError(t(key) !== key ? t(key) : t('error.title'));
      setCode('');
    } finally {
      setBusy(null);
    }
  };

  const demo = async (who: 'shopper' | 'merchant') => {
    setBusy(who);
    try {
      const { demoAccounts } = await import('../mock/seed');
      const r = await session.requestOtp(demoAccounts[who].phone);
      done(await session.verify(r.requestId, r.devCode!));
    } catch {
      setError(t('error.title'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={p.narrow}>
      <div className={p.authCard}>
        <span className={p.authIcon}>
          <Icon name={step === 'phone' ? 'phone' : 'lock'} size={28} />
        </span>
        {step === 'phone' ? (
          <form
            className={p.authForm}
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            noValidate
          >
            <h1>{t('auth.title')}</h1>
            <p className={p.muted}>{asMerchant ? t('auth.subMerchant') : t('auth.sub')}</p>
            <div className={p.phoneRow} dir="ltr">
              <span>+966</span>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="5X XXX XXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, '').slice(0, 10))}
                aria-label={t('auth.phone')}
                aria-invalid={!!error || undefined}
                autoFocus
              />
            </div>
            {error && (
              <p className={p.formError} role="alert">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" block loading={busy === 'send'} disabled={phone.replace(/^0/, '').length < 9}>
              {t('auth.send')}
            </Button>
            {USE_MOCK && (
              <div className={p.demo}>
                <span>{t('auth.demo')}</span>
                <div>
                  <Button type="button" variant={asMerchant ? 'ghost' : 'outline'} size="sm" loading={busy === 'shopper'} onClick={() => demo('shopper')}>
                    <Icon name="user" size={16} /> {t('auth.demo.shopper')}
                  </Button>
                  <Button type="button" variant={asMerchant ? 'outline' : 'ghost'} size="sm" className={asMerchant ? p.demoOn : ''} loading={busy === 'merchant'} onClick={() => demo('merchant')}>
                    <Icon name="store" size={16} /> {t('auth.demo.merchant')}
                  </Button>
                </div>
              </div>
            )}
          </form>
        ) : (
          <form
            className={p.authForm}
            onSubmit={(e) => {
              e.preventDefault();
              verify();
            }}
            noValidate
          >
            <h1>{t('auth.code.title')}</h1>
            <p className={p.muted}>{t('auth.code.sub', { phone: phone.replace(/^0?/, '+966 ') })}</p>
            {req?.devCode && USE_MOCK && <p className={p.hints}>{t('auth.code.demo', { code: req.devCode })}</p>}
            <input
              ref={codeRef}
              className={p.codeInput}
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label={t('auth.code.title')}
              maxLength={4}
              value={code}
              onChange={(e) => {
                const c = e.target.value.replace(/\D/g, '').slice(0, 4);
                setCode(c);
                if (c.length === 4 && (!req?.isNew || name.trim())) verify(c);
              }}
            />
            {req?.isNew && <Field label={t('auth.name')} hint={t('auth.name.sub')} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
            {error && (
              <p className={p.formError} role="alert">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" block loading={busy === 'verify'} disabled={code.length < 4}>
              {t('auth.verify')}
            </Button>
            <div className={p.row}>
              <Button type="button" variant="quiet" size="sm" onClick={() => setStep('phone')}>
                {t('auth.code.change')}
              </Button>
              <Button type="button" variant="quiet" size="sm" disabled={wait > 0} onClick={() => send()}>
                {wait > 0 ? t('auth.code.resend', { n: wait }) : t('auth.code.resendNow')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
