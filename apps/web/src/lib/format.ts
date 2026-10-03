import { t } from '@/i18n';

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 90) return t('analytics.seconds', { n: String(seconds) });
  if (seconds < 5400) return t('analytics.minutes', { n: String(Math.round(seconds / 60)) });
  return t('analytics.hours', { n: (seconds / 3600).toFixed(1) });
}
