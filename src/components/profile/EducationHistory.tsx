'use client';

import { useState } from 'react';
import { GraduationCap, Plus, X, Trash2, Check, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { addEducation, removeEducation } from '@/lib/firebase/auth';
import { Education } from '@/types/firebase';
import { Timestamp } from 'firebase/firestore';
import { useI18n } from '@/hooks/useI18n';

interface EducationHistoryProps {
  userId: string;
  education: Education[];
  onUpdate?: (education: Education[]) => void;
  className?: string;
}

export function EducationHistory({
  userId,
  education,
  onUpdate,
  className,
}: EducationHistoryProps) {
  const { locale, t } = useI18n();
  const [isAdding, setIsAdding] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newEducation, setNewEducation] = useState({
    institution: '',
    degree: '',
    fieldOfStudy: '',
    startDate: '',
    endDate: '',
    isOngoing: false,
  });

  const handleAdd = async () => {
    if (!newEducation.institution.trim() || !newEducation.degree.trim()) {
      setError(t('profile.education.error.requiredFields'));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const educationData = {
        institution: newEducation.institution,
        degree: newEducation.degree,
        fieldOfStudy: newEducation.fieldOfStudy || '',
        startDate: Timestamp.fromDate(new Date(newEducation.startDate || Date.now())),
        endDate: newEducation.endDate && !newEducation.isOngoing
          ? Timestamp.fromDate(new Date(newEducation.endDate))
          : null,
        isOngoing: newEducation.isOngoing,
      };

      await addEducation(userId, educationData);

      // Reset form
      setNewEducation({
        institution: '',
        degree: '',
        fieldOfStudy: '',
        startDate: '',
        endDate: '',
        isOngoing: false,
      });
      setIsAdding(false);
      onUpdate?.(education);
    } catch (err) {
      console.error('Error adding education:', err);
      setError(t('profile.education.error.save'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (edu: Education) => {
    if (!confirm(t('profile.education.confirmDelete'))) return;

    setIsLoading(true);
    try {
      await removeEducation(userId, edu);
      onUpdate?.(education.filter((e) => e.id !== edu.id));
    } catch (err) {
      console.error('Error removing education:', err);
      setError(t('profile.education.error.remove'));
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (timestamp: Timestamp | null): string => {
    if (!timestamp) return '';
    const localeTag = {
      it: 'it-IT',
      en: 'en-US',
      es: 'es-ES',
      fr: 'fr-FR',
      de: 'de-DE',
    }[locale];
    return timestamp.toDate().toLocaleDateString(localeTag, { year: 'numeric', month: 'short' });
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GraduationCap className="text-section-primary" size={20} />
          <h3 className="text-sm font-medium text-text-tertiary">
            {t('profile.education.title', { count: education.length })}
          </h3>
        </div>
        {!isAdding && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsAdding(true)}
            disabled={isLoading}
          >
            <Plus size={16} className="mr-1" />
            {t('profile.education.add')}
          </Button>
        )}
      </div>

      {/* Education List */}
      {education.length > 0 && (
        <div className="space-y-2">
          {education.map((edu) => (
            <div
              key={edu.id}
              className="flex items-start gap-3 p-3 rounded-xl bg-background-secondary/5 border border-hairline"
            >
              <div className="w-10 h-10 rounded-lg bg-section-gradient/10 flex items-center justify-center flex-shrink-0">
                <GraduationCap className="text-section-primary" size={18} />
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-text-inverse text-sm truncate">
                  {edu.degree}
                </p>
                <p className="text-sm text-text-secondary truncate">
                  {edu.institution}
                </p>
                {edu.fieldOfStudy && (
                  <p className="text-xs text-text-tertiary">
                    {edu.fieldOfStudy}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1 text-xs text-text-tertiary">
                  <Calendar size={12} />
                  <span>
                    {formatDate(edu.startDate)} - {edu.isOngoing ? t('profile.education.ongoing') : formatDate(edu.endDate)}
                  </span>
                </div>
              </div>

              <button
                onClick={() => handleDelete(edu)}
                disabled={isLoading}
                className="p-2 rounded-lg text-error/70 hover:text-error hover:bg-error/10 transition-colors disabled:opacity-50"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add New Form */}
      {isAdding && (
        <div className="p-4 rounded-xl bg-background-secondary/5 border border-hairline space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-text-inverse">{t('profile.education.addTitle')}</h4>
            <button
              onClick={() => {
                setIsAdding(false);
                setError(null);
              }}
              className="p-1 rounded-lg text-text-tertiary hover:text-text-inverse hover:bg-surface-2"
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-3">
            <Input
              label={t('profile.education.field.institution')}
              placeholder={t('profile.education.placeholder.institution')}
              value={newEducation.institution}
              onChange={(e) => setNewEducation({ ...newEducation, institution: e.target.value })}
            />

            <Input
              label={t('profile.education.field.degree')}
              placeholder={t('profile.education.placeholder.degree')}
              value={newEducation.degree}
              onChange={(e) => setNewEducation({ ...newEducation, degree: e.target.value })}
            />

            <Input
              label={t('profile.education.field.fieldOfStudy')}
              placeholder={t('profile.education.placeholder.fieldOfStudy')}
              value={newEducation.fieldOfStudy}
              onChange={(e) => setNewEducation({ ...newEducation, fieldOfStudy: e.target.value })}
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label={t('profile.education.field.startDate')}
                type="date"
                value={newEducation.startDate}
                onChange={(e) => setNewEducation({ ...newEducation, startDate: e.target.value })}
              />
              <Input
                label={t('profile.education.field.endDate')}
                type="date"
                value={newEducation.endDate}
                onChange={(e) => setNewEducation({ ...newEducation, endDate: e.target.value })}
                disabled={newEducation.isOngoing}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="ongoing"
                checked={newEducation.isOngoing}
                onChange={(e) => setNewEducation({ ...newEducation, isOngoing: e.target.checked })}
                className="w-4 h-4 rounded border-white/20 bg-background-secondary/10 text-section-primary focus:ring-section-primary"
              />
              <label htmlFor="ongoing" className="text-sm text-text-secondary">
                {t('profile.education.ongoing')}
              </label>
            </div>
          </div>

          {error && (
            <p className="text-sm text-error">{error}</p>
          )}

          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              fullWidth
              onClick={() => {
                setIsAdding(false);
                setError(null);
              }}
              disabled={isLoading}
            >
              {t('profile.education.cancel')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              fullWidth
              onClick={handleAdd}
              disabled={isLoading || !newEducation.institution.trim() || !newEducation.degree.trim()}
              isLoading={isLoading}
            >
              <Check size={16} className="mr-1" />
              {t('profile.education.save')}
            </Button>
          </div>
        </div>
      )}

      {education.length === 0 && !isAdding && (
        <div className="text-center py-6 bg-background-secondary/5 rounded-xl">
          <p className="text-text-tertiary text-sm">{t('profile.education.empty')}</p>
          <p className="text-text-tertiary/70 text-xs mt-1">
            {t('profile.education.emptyHint')}
          </p>
        </div>
      )}
    </div>
  );
}
