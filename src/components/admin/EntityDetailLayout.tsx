'use client';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Edit, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import { SuperadminOnly } from './SuperadminOnly';

interface Props {
  title: string;
  subtitle?: string;
  backHref: string;
  isEditing: boolean;
  isSaving?: boolean;
  onEdit?: () => void;
  onCancelEdit?: () => void;
  onSave?: () => void;
  onDelete?: () => void;
  children: ReactNode;
}

export function EntityDetailLayout({
  title, subtitle, backHref, isEditing, isSaving,
  onEdit, onCancelEdit, onSave, onDelete, children,
}: Props) {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => router.push(backHref)} className="text-content-muted">
        <ArrowLeft className="mr-2 h-4 w-4" />
        {t('admin.detail.back')}
      </Button>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-content">{title}</h1>
          {subtitle && <p className="mt-1 text-content-muted">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {!isEditing && onEdit && (
            <Button variant="secondary" size="sm" onClick={onEdit}>
              <Edit className="mr-1 h-4 w-4" />
              {t('admin.detail.edit')}
            </Button>
          )}
          {isEditing && (
            <>
              <Button variant="ghost" size="sm" onClick={onCancelEdit} disabled={isSaving}>
                <X className="mr-1 h-4 w-4" />
                {t('common.cancel')}
              </Button>
              <Button variant="primary" size="sm" onClick={onSave} isLoading={isSaving}>
                <Save className="mr-1 h-4 w-4" />
                {t('admin.detail.save')}
              </Button>
            </>
          )}
          {onDelete && (
            <SuperadminOnly>
              <Button variant="secondary" size="sm" onClick={onDelete} className="text-red-400 hover:text-red-400">
                <Trash2 className="mr-1 h-4 w-4" />
                {t('admin.detail.delete')}
              </Button>
            </SuperadminOnly>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
