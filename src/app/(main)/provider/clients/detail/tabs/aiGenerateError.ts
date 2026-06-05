import type { useI18n } from '@/hooks/useI18n';

type Translate = ReturnType<typeof useI18n>['t'];

/**
 * Map an error thrown by an AI-generation callable to a localized message.
 * The callable throws an `HttpsError` whose `.code` is like
 * `functions/failed-precondition` (disabled) or `functions/resource-exhausted`
 * (quota exceeded). Anything else falls back to a generic message.
 */
export function aiGenerateErrorMessage(err: unknown, t: Translate): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';

  if (code === 'functions/failed-precondition') {
    return t('clients.aiGenerate.error.disabled');
  }
  if (code === 'functions/resource-exhausted') {
    return t('clients.aiGenerate.error.quotaExceeded');
  }
  return t('clients.aiGenerate.error.generic');
}
