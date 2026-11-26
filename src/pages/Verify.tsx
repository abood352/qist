import { USE_MOCK } from '@pf/core/env';
import { amount } from '@pf/core/format';
import type { ApiError } from '@pf/core/http';
import { useI18n } from '@pf/core/react/i18n';
import { getCached, invalidate, setCached, useQuery } from '@pf/core/react/query';
import { Link, navigate, setQuery, useLocation, usePageMeta } from '@pf/core/react/router';
import { useState } from 'react';
import { EMPLOYERS, INCOME_BANDS, isNationalId } from '../api/plans';
import { api } from '../api/services';
import type { EmployerType, IncomeBand, LimitInfo } from '../api/types';
import { today } from '../api/util';
import { WrongRole } from '../components/Gate';
import { Icon } from '../components/Icon';
import { Button, ErrorState, Field, Skeleton, ui } from '../components/ui';
import { useCountUp } from '../lib/hooks';
import { dateFull, errText } from '../lib/fmt';
import { safeNext, useRequireUser } from '../state/guard';
import p from './pages.module.css';

export default function Verify() {
  const { t, lang } = useI18n();
  const { query } = useLocation();
  const next = query.get('next');
  const user = useRequireUser('/verify');
  const shopper = user?.role === 'shopper';
  const key = shopper ? `limit:${user.id}` : null;
  // poll while the review is pending, decided from the query's own cached data (works after a reload too)
  const pending = key ? getCached<LimitInfo>(key)?.status === 'pending' : false;
  const limit = useQuery(key, () => api.me.limit(), { staleMs: 0, refetchMs: pending ? 2500 : undefined });
  const info = limit.data;
  const status = info?.status;
  usePageMeta(t('verify.title'), t('app.name'));

  const [nationalId, setNationalId] = useState('');
  const [income, setIncome] = useState<IncomeBand | ''>('');
  const wanted = Math.min(3, Math.max(1, Number(query.get('step')) || 1));
  const step = wanted > 1 && !isNationalId(nationalId) ? 1 : wanted > 2 && !income ? 2 : wanted;
  const [employer, setEmployer] = useState<EmployerType | ''>('');
  const [idTouched, setIdTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const approved = status === 'approved';
  const count = useCountUp(info?.limit ?? 0, approved);

  if (user && !shopper) return <WrongRole need="shopper" />;

  const canRetry = status === 'none' || (status === 'declined' && (!info?.retryAfter || info.retryAfter <= today()));
  const idOk = isNationalId(nationalId);

  const submit = async () => {
    if (!idOk || !income || !employer || !key) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.me.verifyIdentity({ nationalId, incomeBand: income, employer });
      setCached<LimitInfo>(key, () => res);
      invalidate('quote');
      setNationalId('');
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'ALREADY_APPROVED' || err.code === 'REVIEW_PENDING' || err.code === 'RETRY_LATER') limit.refetch();
      if (err.code === 'VALIDATION' && err.details?.nationalId) setQuery({ step: 1 });
      setError(errText(err, t));
    } finally {
      setBusy(false);
    }
  };

  const goNext = () => navigate(safeNext(next) ?? '/stores');

  return (
    <div className={p.mid}>
      {limit.status === 'error' && !info ? (
        <ErrorState error={limit.error} onRetry={limit.refetch} />
      ) : !info ? (
        <div className={p.skelRow}>
          <Skeleton w="50%" h={30} />
          <Skeleton h={240} r={22} />
        </div>
      ) : approved ? (
        <div className={p.result} role="status">
          <span className={p.authIcon}>
            <Icon name="shield-check" size={28} />
          </span>
          <h1>{t('verify.approved.title')}</h1>
          <div className={`${p.reveal} num`} aria-live="polite" aria-label={`${amount(info.limit, lang)} ${t('common.sar')}`}>
            <span aria-hidden="true">{amount(count, lang)}</span>
            <small aria-hidden="true">{t('common.sar')}</small>
          </div>
          <p>{t('verify.approved.body')}</p>
          <div className={p.row} style={{ justifyContent: 'center' }}>
            <Button size="lg" onClick={goNext}>
              {next ? t('verify.continue') : t('verify.shop')}
            </Button>
            <Link to="/plans" className={`${ui.btn} ${ui.outline} ${ui.lg}`}>
              {t('nav.plans')}
            </Link>
          </div>
        </div>
      ) : status === 'pending' ? (
        <div className={p.result} role="status" aria-live="polite">
          <div className={p.waitRing} aria-hidden="true" />
          <h1>{t('verify.pending.title')}</h1>
          <p>{t('verify.pending.body')}</p>
          <small className={p.muted}>{t('verify.pending.note')}</small>
        </div>
      ) : !canRetry ? (
        <div className={p.result}>
          <span className={p.authIcon} style={{ background: 'var(--coral-soft)', color: 'var(--coral-text)' }}>
            <Icon name="alert" size={28} />
          </span>
          <h1>{t('verify.declined.title')}</h1>
          <p>{t('verify.declined.reason')}</p>
          {info.retryAfter && <p className={p.alert_warn} style={{ padding: '10px 16px', borderRadius: 14 }}>{t('verify.declined.retry', { date: dateFull(info.retryAfter, lang) })}</p>}
          <Link to="/stores" className={`${ui.btn} ${ui.outline} ${ui.md}`}>
            {t('verify.browse')}
          </Link>
        </div>
      ) : (
        <>
          <div className={p.head}>
            <span className={p.eyebrow}>{t('verify.eyebrow')}</span>
            <h1>{t('verify.title')}</h1>
            <p>{t('verify.sub')}</p>
          </div>
          {status === 'declined' && (
            <div className={`${p.alert} ${p.alert_info}`} role="status">
              <Icon name="info" size={20} />
              <div>
                <span>{t('verify.again')}</span>
              </div>
            </div>
          )}
          <ol className={p.steps} aria-label={t('verify.steps')}>
            {(['id', 'income', 'employer'] as const).map((k, i) => (
              <li key={k} aria-current={step === i + 1 ? 'step' : undefined} data-done={step > i + 1 ? '' : undefined}>
                <i />
                {t(`verify.step.${k}`)}
              </li>
            ))}
          </ol>

          <form
            className={p.card}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (step === 1) idOk ? setQuery({ step: 2 }, { replace: false }) : setIdTouched(true);
              else if (step === 2) income && setQuery({ step: 3 }, { replace: false });
              else submit();
            }}
          >
            {step === 1 && (
              <>
                <h2>{t('verify.id.title')}</h2>
                <Field
                  label={t('verify.id.label')}
                  value={nationalId}
                  inputMode="numeric"
                  autoComplete="off"
                  dir="ltr"
                  maxLength={10}
                  placeholder="1XXXXXXXXX"
                  autoFocus
                  onBlur={() => setIdTouched(true)}
                  onChange={(e) => setNationalId(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  error={idTouched && !idOk ? t('verify.id.err') : undefined}
                  hint={t('verify.id.hint')}
                />
                <p className={p.muted + ' ' + p.small}>
                  <Icon name="lock" size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> {t('verify.privacy')}
                </p>
              </>
            )}
            {step === 2 && (
              <fieldset className={p.fieldset}>
                <legend>{t('verify.income.title')}</legend>
                <div className={p.choiceGrid}>
                  {INCOME_BANDS.map((b) => (
                    <label key={b} className={p.choice}>
                      <input type="radio" name="income" checked={income === b} onChange={() => setIncome(b)} />
                      {t(`income.${b}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {step === 3 && (
              <fieldset className={p.fieldset}>
                <legend>{t('verify.employer.title')}</legend>
                <div className={p.choiceGrid}>
                  {EMPLOYERS.map((b) => (
                    <label key={b} className={p.choice}>
                      <input type="radio" name="employer" checked={employer === b} onChange={() => setEmployer(b)} />
                      {t(`employer.${b}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {error && (
              <p className={p.formError} role="alert">
                {error}
              </p>
            )}
            <div className={p.row}>
              {step > 1 && (
                <Button type="button" variant="ghost" onClick={() => setQuery({ step: step - 1 }, { replace: false })}>
                  {t('common.back')}
                </Button>
              )}
              <Button type="submit" loading={busy} disabled={(step === 2 && !income) || (step === 3 && !employer)}>
                {step === 3 ? t('verify.submit') : t('common.next')}
              </Button>
            </div>
          </form>

          {USE_MOCK && (
            <div className={p.hints}>
              <b>{t('verify.hints.title')}</b>
              <ul>
                <li>{t('verify.hints.approve')}</li>
                <li>{t('verify.hints.pending')}</li>
                <li>{t('verify.hints.decline')}</li>
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
