'use client';

import { CheckCircle, Loader2, AlertTriangle, X } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { BulkDeleteJobView } from '@/lib/firebase/bulkDelete';

interface Props {
  job: BulkDeleteJobView;
  onDismiss: () => void;
}

export function BulkDeleteJobBanner({ job, onDismiss }: Props) {
  const { t } = useI18n();
  const isFailed = job.status === 'failed';
  const finished = isFailed || job.status === 'completed' || job.status === 'completed_with_errors';
  const processed = job.deleted + job.skipped + job.failed;
  const hasFailures = isFailed || job.failed > 0;
  const Icon = !finished ? Loader2 : hasFailures ? AlertTriangle : CheckCircle;
  const heading = !finished
    ? t('admin.users.bulkDeleteJob.running')
    : isFailed
      ? t('admin.users.bulkDeleteJob.failed')
      : t('admin.users.bulkDeleteJob.finished');

  return (
    // Dismissible at every stage: the job keeps running server-side regardless, and a
    // reload brings the banner back via findRunningBulkDelete — so hiding it never strands
    // the admin behind a permanent spinner.
    <div className="flex items-center gap-3 rounded-xl border border-hairline bg-surface-2 p-4">
      <Icon
        className={`h-5 w-5 flex-shrink-0 ${finished ? '' : 'motion-safe:animate-spin'} ${hasFailures ? 'text-[#F59E0B]' : 'text-[#10B981]'}`}
      />
      <div className="flex-1 text-sm text-content">
        {/* role="status" only on the heading — re-announcing the whole banner (counts
            included) on every throttled progress write would spam screen readers. */}
        <p role="status" className="font-medium">
          {heading}
        </p>
        <p className="text-content-muted">
          {t('admin.users.bulkDeleteJob.progress', {
            done: String(processed),
            total: String(job.total),
            deleted: String(job.deleted),
            skipped: String(job.skipped),
            failed: String(job.failed),
          })}
        </p>
        {isFailed && job.error && <p className="text-content-muted">{job.error}</p>}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('common.close')}
        className="touch-target flex items-center justify-center rounded-full text-content-muted hover:text-content"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
