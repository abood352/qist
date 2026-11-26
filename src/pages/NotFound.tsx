import { useI18n } from '@pf/core/react/i18n';
import { navigate, usePageMeta } from '@pf/core/react/router';
import { Button, EmptyState } from '../components/ui';

export default function NotFound() {
  const { t } = useI18n();
  usePageMeta(t('error.404.title'), t('app.name'));
  return (
    <div className="container" style={{ paddingBlock: 56 }}>
      <EmptyState title={t('error.404.title')} body={t('error.404.body')} action={<Button onClick={() => navigate('/')}>{t('error.404.cta')}</Button>} />
    </div>
  );
}
