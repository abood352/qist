import { useI18n } from '@pf/core/react/i18n';
import { navigate } from '@pf/core/react/router';
import { session } from '../state/session';
import { Icon } from './Icon';
import { Button, EmptyState } from './ui';

/** Shown when the signed-in account has the wrong role for a screen: offers to switch account. */
export function WrongRole({ need }: { need: 'shopper' | 'merchant' }) {
  const { t } = useI18n();
  return (
    <div className="container" style={{ paddingBlock: 48 }}>
      <EmptyState
        art={<Icon name={need === 'merchant' ? 'store' : 'user'} size={64} />}
        title={t(need === 'merchant' ? 'gate.merchant.title' : 'gate.shopper.title')}
        body={t(need === 'merchant' ? 'gate.merchant.body' : 'gate.shopper.body')}
        action={
          <Button
            onClick={async () => {
              await session.logout();
              navigate(`/login?as=${need}`);
            }}
          >
            {t('gate.switch')}
          </Button>
        }
      />
    </div>
  );
}
