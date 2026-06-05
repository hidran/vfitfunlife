'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';
import { addClientNote, getClientDetails } from '@/lib/firebase/provider';
import type { ClientNote } from '@/types/provider';

interface NotesTabProps {
  clientId: string;
  initialNotes?: ClientNote[];
}

export default function NotesTab({ clientId, initialNotes = [] }: NotesTabProps) {
  const { t, locale } = useI18n();
  const [notes, setNotes] = useState<ClientNote[]>(initialNotes);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const formatDate = (date: Date | { toDate(): Date } | undefined) => {
    if (!date) return '';
    const d = typeof date === 'object' && 'toDate' in date ? date.toDate() : date;
    return new Date(d).toLocaleDateString(toLocaleTag(locale), {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleAdd = async () => {
    const content = text.trim();
    if (!content || saving) return;
    setSaving(true);
    try {
      await addClientNote(clientId, content);
      const { notes: refreshed } = await getClientDetails(clientId);
      setNotes(refreshed);
      setText('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface-elevated rounded-xl border border-hairline p-6">
      <h3 className="text-lg font-semibold text-content mb-4">{t('clients.notes.title')}</h3>

      <div className="space-y-3 mb-6">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('clients.notes.placeholder')}
          className="w-full bg-surface-input border border-hairline rounded-lg px-4 py-3 text-content placeholder-gray-500 outline-none focus:border-section-primary min-h-[100px]"
        />
        <Button size="sm" onClick={handleAdd} disabled={!text.trim() || saving}>
          <Plus className="w-4 h-4 mr-2" />
          {t('clients.notes.add')}
        </Button>
      </div>

      {notes.length === 0 ? (
        <p className="text-gray-400 text-sm">{t('clients.notes.empty')}</p>
      ) : (
        <div className="space-y-4">
          {notes.map((note) => (
            <div key={note.id} className="bg-surface-input rounded-lg p-4">
              <span className="text-sm text-gray-400">{formatDate(note.createdAt)}</span>
              <p className="text-gray-300 mt-2 whitespace-pre-wrap">{note.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
