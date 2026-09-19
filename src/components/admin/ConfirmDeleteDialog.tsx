'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import { AlertTriangle, X } from 'lucide-react';

interface Props {
  open: boolean;
  entityLabel: string;
  entityName: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
}

export function ConfirmDeleteDialog({ open, entityLabel, entityName, onClose, onConfirm }: Props) {
  const { t } = useI18n();
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const matches = typed === entityName && reason.trim().length > 0;

  // Without this, Cancel / the header close button left `typed`/`reason` in state, so
  // reopening the dialog for the same entityName (e.g. a page-sized selection count) could
  // come back pre-armed with the confirm button already enabled.
  function handleClose() {
    setTyped('');
    setReason('');
    onClose();
  }

  async function handleConfirm() {
    if (!matches) return;
    setBusy(true);
    try {
      await onConfirm(reason);
      onClose();
    } finally {
      setBusy(false);
      setTyped('');
      setReason('');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-surface border border-hairline p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-content">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            {t('admin.delete.title', { entity: entityLabel })}
          </h2>
          <button type="button" onClick={handleClose} aria-label={t('common.close')} className="text-content-muted hover:text-content">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-sm text-content-muted">{t('admin.delete.warning', { name: entityName })}</p>
        <label className="block space-y-1">
          <span className="text-xs text-content-muted">{t('admin.delete.typeNameLabel', { name: entityName })}</span>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="w-full rounded-lg bg-surface-sunken border border-hairline px-3 py-2 text-content"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-content-muted">{t('admin.delete.reasonLabel')}</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="w-full rounded-lg bg-surface-sunken border border-hairline px-3 py-2 text-content"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={handleClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={!matches || busy}
            className="bg-red-500 hover:bg-red-600"
          >
            {busy ? t('common.loading') : t('admin.delete.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
