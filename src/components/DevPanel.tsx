import { USE_MOCK } from '@pf/core/env';
import { readMockSettings, writeMockSettings } from '@pf/core/mock';
import { useI18n } from '@pf/core/react/i18n';
import { toast } from '@pf/core/react/toast';
import { useState } from 'react';
import { session } from '../state/session';
import { Icon } from './Icon';
import { Button } from './ui';
import s from './dev.module.css';

/**
 * Lets a reviewer exercise every state on purpose: slow the "network" down to see
 * skeletons and optimistic UI, or make calls fail to see error and retry states.
 * Only rendered in mock mode.
 */
export function DevPanel() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(readMockSettings);
  if (!USE_MOCK) return null;

  const update = (patch: Partial<typeof settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    writeMockSettings(next);
  };

  return (
    <div className={s.dev}>
      {open && (
        <div className={s.devPanel} role="dialog" aria-label={t('dev.title')}>
          <div>
            <h2>{t('dev.title')}</h2>
            <p>{t('dev.mock')}</p>
          </div>
          <div className={s.devRow}>
            <label htmlFor="dev-latency">
              {t('dev.latency')} <span className="num ltr">{settings.latency} ms</span>
            </label>
            <input id="dev-latency" type="range" min={0} max={2500} step={50} value={settings.latency} onChange={(e) => update({ latency: +e.target.value })} />
          </div>
          <label className={s.devSwitch}>
            {t('dev.fail')} <span className="num ltr">{Math.round(settings.failRate * 100)}%</span>
            <input type="checkbox" checked={settings.failRate > 0} onChange={(e) => update({ failRate: e.target.checked ? 0.35 : 0 })} />
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              (await import('../mock/server')).resetQistDb();
              await session.logout();
              toast(t('dev.resetDone'));
              setTimeout(() => location.reload(), 400);
            }}
          >
            <Icon name="refresh" size={16} /> {t('dev.reset')}
          </Button>
        </div>
      )}
      <button className={s.devToggle} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={t('dev.title')}>
        <i aria-hidden="true" /> <Icon name="code" size={14} /> <span>Mock API</span>
      </button>
    </div>
  );
}
