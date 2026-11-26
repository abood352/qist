import { useI18n } from '@pf/core/react/i18n';
import { invalidate, useQuery } from '@pf/core/react/query';
import { usePageMeta } from '@pf/core/react/router';
import { toast } from '@pf/core/react/toast';
import { useState } from 'react';
import { isExpired } from '../api/cards';
import { api } from '../api/services';
import type { Card } from '../api/types';
import { WrongRole } from '../components/Gate';
import { Icon } from '../components/Icon';
import { BrandTag, CardForm } from '../components/Qist';
import { Badge, Button, Dialog, EmptyState, ErrorState, Skeleton } from '../components/ui';
import { errText } from '../lib/fmt';
import { useRequireUser } from '../state/guard';
import p from './pages.module.css';

const MAX_CARDS = 5;

export default function Wallet() {
  const { t, l } = useI18n();
  const user = useRequireUser('/wallet');
  const shopper = user?.role === 'shopper';
  const res = useQuery(shopper ? `cards:${user.id}` : null, () => api.me.cards());
  const plansQ = useQuery(shopper ? `plans:${user.id}` : null, () => api.plans.list());
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Card | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  usePageMeta(t('wallet.title'), t('app.name'));
  if (user && !shopper) return <WrongRole need="shopper" />;

  const cards = res.data ?? [];
  const full = cards.length >= MAX_CARDS;

  const makeDefault = async (c: Card) => {
    setBusy(c.id);
    try {
      await api.me.setDefaultCard(c.id);
      invalidate('cards');
      toast(t('wallet.toast.default'));
    } catch (e) {
      toast(errText(e, t), { tone: 'err' });
    } finally {
      setBusy(null);
    }
  };

  // active plans that use the card being removed, and what their payments will use instead
  const usedBy = removing ? (plansQ.data ?? []).filter((pl) => pl.status === 'active' && pl.paymentMethodId === removing.id) : [];
  const autoPlans = usedBy.filter((pl) => pl.autopay);
  const fallback = cards.find((c) => c.default && c.id !== removing?.id) ?? cards.find((c) => c.id !== removing?.id);

  const remove = async () => {
    if (!removing) return;
    setBusy(removing.id);
    setErr('');
    try {
      // autopay can't run without the card, so it is switched off first (the dialog says so)
      for (const pl of autoPlans) await api.plans.update(pl.id, { autopay: false });
      await api.me.removeCard(removing.id);
      invalidate('plans');
      invalidate('upcoming');
      invalidate('cards');
      invalidate('plan');
      toast(t('wallet.toast.removed'));
      setRemoving(null);
    } catch (e) {
      setErr(errText(e, t));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={p.mid}>
      <div className={p.head}>
        <h1>{t('wallet.title')}</h1>
        <p>{t('wallet.sub')}</p>
      </div>

      {res.status === 'error' && !res.data ? (
        <ErrorState error={res.error} onRetry={res.refetch} />
      ) : res.status === 'loading' ? (
        <div className={p.skelRow}>
          <Skeleton h={78} r={20} />
          <Skeleton h={78} r={20} />
        </div>
      ) : cards.length === 0 && !adding ? (
        <EmptyState
          art={<Icon name="card" size={64} />}
          title={t('wallet.empty.title')}
          body={t('wallet.empty.body')}
          action={<Button onClick={() => setAdding(true)}>{t('wallet.add')}</Button>}
        />
      ) : (
        <ul className={p.cardList}>
          {cards.map((c) => (
            <li key={c.id} className={p.walletCard}>
              <div>
                <span className={p.row} style={{ gap: 8 }}>
                  <BrandTag brand={c.brand} />
                  {c.default && <Badge tone="green">{t('wallet.default')}</Badge>}
                  {isExpired(c.expiry) && <Badge tone="danger">{t('wallet.expired')}</Badge>}
                </span>
                <b className="num ltr">•••• {c.last4}</b>
                <small className={p.muted}>
                  {t('card.expiry')} <span className="num ltr">{c.expiry}</span>
                </small>
              </div>
              {!c.default && (
                <Button size="sm" variant="ghost" loading={busy === c.id} onClick={() => makeDefault(c)}>
                  {t('wallet.makeDefault')}
                </Button>
              )}
              <Button size="sm" variant="danger" onClick={() => (setErr(''), setRemoving(c))} aria-label={`${t('common.delete')} •••• ${c.last4}`}>
                <Icon name="trash" size={16} /> {t('common.delete')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {res.data && (
        <section className={p.card} aria-labelledby="wallet-add">
          <div className={p.cardHead}>
            <h2 id="wallet-add">{t('wallet.add')}</h2>
            {!adding && (
              <Button size="sm" variant="outline" disabled={full} onClick={() => setAdding(true)}>
                <Icon name="plus" size={16} /> {t('wallet.add')}
              </Button>
            )}
          </div>
          {full && <p className={p.muted}>{t('wallet.max', { n: MAX_CARDS })}</p>}
          {adding && !full && (
            <CardForm
              autoFocus
              onAdded={() => {
                setAdding(false);
                toast(t('wallet.toast.added'));
              }}
              onCancel={() => setAdding(false)}
            />
          )}
        </section>
      )}

      <section className={`${p.alert} ${p.alert_info}`} aria-label={t('wallet.autopay.title')}>
        <Icon name="repeat" size={22} />
        <div>
          <b>{t('wallet.autopay.title')}</b>
          <span>{t('wallet.autopay.body')}</span>
        </div>
      </section>

      {removing && (
        <Dialog open onClose={() => setRemoving(null)} title={t('wallet.remove.title')}>
          <div className={p.skelRow} style={{ gap: 14 }}>
            <p>
              {t('wallet.remove.body')} <b className="num ltr">•••• {removing.last4}</b>
            </p>
            {usedBy.length > 0 && (
              <div>
                <p>{t('wallet.remove.plans')}</p>
                <ul>
                  {usedBy.map((pl) => (
                    <li key={pl.id}>
                      {l(pl.store.name)} · <span className="ltr">{pl.code}</span>
                      {pl.autopay && ` · ${t('upcoming.auto')}`}
                    </li>
                  ))}
                </ul>
                {autoPlans.length > 0 && <p>{t('wallet.remove.stop')}</p>}
                {fallback ? (
                  <p>
                    {t('wallet.remove.use')} <b className="num ltr">•••• {fallback.last4}</b>
                  </p>
                ) : (
                  <p>{t('wallet.remove.none')}</p>
                )}
              </div>
            )}
            {err && (
              <p className={p.formError} role="alert">
                {err}
              </p>
            )}
            <div className={p.row}>
              <Button variant="danger" loading={busy === removing.id} onClick={remove}>
                {t('wallet.remove.confirm')}
              </Button>
              <Button variant="ghost" onClick={() => setRemoving(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
