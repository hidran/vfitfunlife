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
  const finished = job.status === 'completed' || job.status === 'completed_with_errors';
  const processed = job.deleted + job.skipped + job.failed;
  const Icon = !finished ? Loader2 : job.failed > 0 ? AlertTriangle : CheckCircle;

  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-xl border border-hairline bg-surface-2 p-4"
    >
      <Icon className={`h-5 w-5 flex-shrink-0 ${finished ? '' : 'animate-spin'} ${job.failed > 0 ? 'text-[#F59E0B]' : 'text-[#10B981]'}`} />
      <div className="flex-1 text-sm text-content">
        <p className="font-medium">
          {finished ? t('admin.users.bulkDeleteJob.finished') : t('admin.users.bulkDeleteJob.running')}
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
      </div>
      {finished && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('common.close')}
          className="touch-target flex items-center justify-center rounded-full text-content-muted hover:text-content"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
