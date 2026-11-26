import { amount } from '@pf/core/format';
import { useI18n } from '@pf/core/react/i18n';
import { useQuery } from '@pf/core/react/query';
import { Link, usePageMeta } from '@pf/core/react/router';
import { useEffect, useState } from 'react';
import { LATE_FEE, LATE_FEE_CAP_RATE, MAX_LATE_FEES, PLAN_TYPES, PLANS, schedule } from '../api/plans';
import { api } from '../api/services';
import { today } from '../api/util';
import { Icon, type IconName } from '../components/Icon';
import { StoreLogo } from '../components/Qist';
import { Skeleton, ui } from '../components/ui';
import { dateShort } from '../lib/fmt';
import h from './home.module.css';

const MIN = 100;
const MAX = 5000;
const FAQ = [1, 2, 3, 4, 5, 6];

/** The prerendered first screen: everything above paints with no data; stores and calculator dates arrive after mount. */
export default function Home() {
  const { t, l, lang } = useI18n();
  usePageMeta(t('app.name'), t('app.tagline'));
  const [total, setTotal] = useState(1200);
  // "today" differs between the build-time prerender and the browser, so dates appear after mount
  const [start, setStart] = useState<string | null>(null);
  useEffect(() => setStart(today()), []);
  const stores = useQuery('stores:all', () => api.stores.list(), { staleMs: 120_000 });
  const clamp = (n: number) => Math.max(MIN, Math.min(MAX, Number.isFinite(n) ? Math.round(n) : MIN));

  const steps: [IconName, string][] = [
    ['shield-check', 'home.how.1'],
    ['bag', 'home.how.2'],
    ['calendar', 'home.how.3'],
  ];
  const trust: [IconName, string][] = [
    ['percent', 'nointerest'],
    ['receipt', 'nofees'],
    ['clock', 'late'],
  ];

  return (
    <>
      <section className={h.hero}>
        <div className={`container ${h.heroGrid}`}>
          <div className={h.heroText}>
            <span className={h.pill}>
              <Icon name="sparkle" size={14} /> {t('home.eyebrow')}
            </span>
            <h1>{t('home.title')}</h1>
            <p className={h.lead}>{t('home.lead')}</p>
            <div className={h.cta}>
              <Link to="/stores" className={`${ui.btn} ${ui.primary} ${ui.lg}`}>
                {t('home.cta.shop')} <Icon name="arrow-end" size={18} />
              </Link>
              <Link to="/verify" className={`${ui.btn} ${ui.outline} ${ui.lg}`}>
                {t('home.cta.limit')}
              </Link>
            </div>
            <small className={h.demoNote}>{t('home.demo')}</small>
          </div>

          <div className={h.illus} aria-hidden="true">
            <div className={h.illusCard}>
              <small>{t('home.illus.order')}</small>
              <b className={h.illusTotal}>
                240 <small>{t('common.sar')}</small>
              </b>
              <ol className={h.dots}>
                {[0, 1, 2, 3].map((i) => (
                  <li key={i} style={{ ['--i' as string]: i }}>
                    <i />
                    <b>60</b>
                    <small>{t(`home.illus.d${i}`)}</small>
                  </li>
                ))}
              </ol>
              <div className={h.track}>
                <i />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={`container ${h.section}`} aria-labelledby="calc-h">
        <div className={h.calc}>
          <div className={h.calcIn}>
            <h2 id="calc-h">{t('home.calc.title')}</h2>
            <p className={h.muted}>{t('home.calc.sub')}</p>
            <div className={h.calcTotal}>
              <label htmlFor="calc-num">{t('home.calc.total')}</label>
              <div className={h.numWrap}>
                <input id="calc-num" type="number" inputMode="numeric" dir="ltr" min={MIN} max={MAX} step={50} value={total} onChange={(e) => setTotal(Number(e.target.value))} onBlur={() => setTotal(clamp(total))} className="num" />
                <span>{t('common.sar')}</span>
              </div>
            </div>
            <input type="range" min={MIN} max={MAX} step={50} value={clamp(total)} onChange={(e) => setTotal(Number(e.target.value))} aria-label={t('home.calc.total')} className={h.range} style={{ ['--p' as string]: `${((clamp(total) - MIN) / (MAX - MIN)) * 100}%` }} />
            <div className={h.rangeEnds} aria-hidden="true">
              <span className="num">{MIN}</span>
              <span className="num">{amount(MAX, lang)}</span>
            </div>
          </div>
          <ul className={h.plans} aria-live="polite">
            {PLAN_TYPES.map((id) => {
              const def = PLANS[id];
              const t2 = clamp(total);
              const ok = t2 >= def.min && (def.max === null || t2 <= def.max);
              const sched = schedule(id, t2, start ?? '2000-01-01');
              const each = sched[sched.length - 1].amount;
              return (
                <li key={id} className={ok ? '' : h.off}>
                  <div className={h.planTop}>
                    <b>{l(def.name)}</b>
                    <span className={h.planAmt}>
                      {def.count > 1 ? (
                        <>
                          <b className="num">{amount(each, lang)}</b> <small>{t('home.calc.each', { n: def.count })}</small>
                        </>
                      ) : (
                        <>
                          <b className="num">{amount(each, lang)}</b> <small>{t('home.calc.once')}</small>
                        </>
                      )}
                    </span>
                  </div>
                  {ok ? (
                    <ol className={h.sched}>
                      {sched.map((x) => (
                        <li key={x.n} className={x.n === 1 && def.firstToday ? h.schedFirst : undefined}>
                          <b className="num">{amount(x.amount, lang)}</b>
                          <small>{x.n === 1 && def.firstToday ? t('day.today') : start ? dateShort(x.dueDate, lang) : '—'}</small>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <small className={h.reason}>{t(def.max !== null && t2 > def.max ? 'home.calc.max' : 'home.calc.min', { n: amount(def.max !== null && t2 > def.max ? def.max : def.min, lang), sar: t('common.sar') })}</small>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className={`container ${h.section}`} aria-labelledby="how-h">
        <h2 id="how-h" className={h.h2}>
          {t('home.how.title')}
        </h2>
        <ol className={h.steps}>
          {steps.map(([icon, k], i) => (
            <li key={k}>
              <span className={h.stepNum}>{i + 1}</span>
              <Icon name={icon} size={26} />
              <b>{t(`${k}.title`)}</b>
              <p>{t(`${k}.body`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={`container ${h.section}`} aria-labelledby="stores-h">
        <div className={h.sectionHead}>
          <h2 id="stores-h" className={h.h2}>
            {t('home.stores.title')}
          </h2>
          <Link to="/stores" className={h.more}>
            {t('common.seeAll')} <Icon name="chevron-end" size={16} />
          </Link>
        </div>
        <ul className={h.stores}>
          {stores.data
            ? stores.data.map((s) => (
                <li key={s.id}>
                  <Link to={`/stores/${s.id}`}>
                    <StoreLogo store={s} size={40} />
                    <span>{l(s.name)}</span>
                  </Link>
                </li>
              ))
            : Array.from({ length: 8 }, (_, i) => (
                <li key={i} className={h.storeSkel}>
                  <Skew />
                </li>
              ))}
        </ul>
      </section>

      <section className={`container ${h.section}`} aria-labelledby="trust-h">
        <h2 id="trust-h" className={h.h2}>
          {t('home.trust.title')}
        </h2>
        <div className={h.trust}>
          {trust.map(([icon, k]) => (
            <article key={k}>
              <span className={h.trustIcon}>
                <Icon name={icon} size={24} />
              </span>
              <h3>{t(`home.trust.${k}.title`)}</h3>
              <p>{k === 'late' ? t('home.trust.late.body', { fee: LATE_FEE, cap: Math.round(LATE_FEE_CAP_RATE * 100), max: MAX_LATE_FEES }) : t(`home.trust.${k}.body`)}</p>
            </article>
          ))}
        </div>
        <p className={h.fine}>{t('home.trust.note')}</p>
      </section>

      <section className={`container ${h.section}`} aria-labelledby="faq-h">
        <h2 id="faq-h" className={h.h2}>
          {t('home.faq.title')}
        </h2>
        <div className={h.faq}>
          {FAQ.map((n) => (
            <details key={n}>
              <summary>
                {t(`home.faq.${n}.q`)}
                <Icon name="chevron-down" size={18} />
              </summary>
              <p>{n === 3 ? t('home.faq.3.a', { fee: LATE_FEE, cap: Math.round(LATE_FEE_CAP_RATE * 100), max: MAX_LATE_FEES }) : t(`home.faq.${n}.a`)}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={`container ${h.section}`}>
        <div className={h.merchant}>
          <div>
            <h2>{t('home.merchant.title')}</h2>
            <p>{t('home.merchant.body')}</p>
          </div>
          <Link to="/login?as=merchant" className={`${ui.btn} ${ui.lg} ${h.merchantBtn}`}>
            <Icon name="store" size={18} /> {t('home.merchant.cta')}
          </Link>
        </div>
      </section>
    </>
  );
}

function Skew() {
  return <Skeleton w="100%" h={56} r={16} />;
}
