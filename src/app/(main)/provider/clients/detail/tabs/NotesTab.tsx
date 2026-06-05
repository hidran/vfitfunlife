'use client';

import { Plus, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';

export default function NotesTab() {
  const { t } = useI18n();

  return (
    <div className="bg-surface-elevated rounded-xl border border-hairline p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-content">{t('provider.clientDetail.allNotes')}</h3>
        <Button variant="secondary" size="sm">
          <Plus className="w-4 h-4 mr-2" />
          {t('provider.clientDetail.addNote')}
        </Button>
      </div>

      <div className="space-y-4">
        <div className="bg-surface-input rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">January 15, 2024</span>
            <div className="flex gap-2">
              <button className="p-1.5 text-gray-400 hover:text-content rounded">
                <Edit className="w-4 h-4" />
              </button>
              <button className="p-1.5 text-red-400 hover:text-red-300 rounded">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className="text-gray-300">
            Client mentioned knee pain during squats. Modified exercise to leg press instead.
          </p>
        </div>

        <div className="bg-surface-input rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">January 10, 2024</span>
            <div className="flex gap-2">
              <button className="p-1.5 text-gray-400 hover:text-content rounded">
                <Edit className="w-4 h-4" />
              </button>
              <button className="p-1.5 text-red-400 hover:text-red-300 rounded">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className="text-gray-300">
            Excellent progress on core strength. Increased plank hold to 2 minutes.
          </p>
        </div>
      </div>
    </div>
  );
}
