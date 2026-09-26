'use client';

import { useState } from 'react';
import { useServiceCategoryGroups } from '@/hooks/useServiceCategories';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';

interface CategoryLeafPickerProps {
  /** Selected taxonomy LEAF ids. */
  value: string[];
  onChange: (categoryIds: string[]) => void;
  disabled?: boolean;
}

/**
 * Multi-select over the service taxonomy: groups as headings, leaves as chips.
 *
 * Selects by id, never by display name. The pickers it replaces stored the label in the
 * current locale, so an applicant who signed up in English saved "Massage" and the Italian
 * profile screen, looking for "Massaggio", showed nothing selected. Only leaves are
 * offered: a service — and so a provider's category — can only sit on a leaf.
 */
export function CategoryLeafPicker({ value, onChange, disabled }: CategoryLeafPickerProps) {
  const groups = useServiceCategoryGroups();
  const { t } = useI18n();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  const selectedGroup = groups.find(({ leaves }) => leaves.some((leaf) => value.includes(leaf.id)))?.group.id;
  const visibleGroupId = activeGroupId ?? selectedGroup ?? groups[0]?.group.id;
  const activeGroup = groups.find(({ group }) => group.id === visibleGroupId) ?? groups[0];
  const selectedLeaves = groups.flatMap(({ leaves }) => leaves.filter((leaf) => value.includes(leaf.id)));

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="space-y-3" aria-label={t('provider.optIn.pickServices')}>
      {selectedLeaves.length > 0 && (
        <div className="rounded-lg border border-vfit-primary/30 bg-vfit-primary/10 px-3 py-2">
          <p className="text-xs font-semibold text-vfit-primary">
            {t('provider.optIn.selectedCount', { count: selectedLeaves.length })}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {selectedLeaves.map((leaf) => (
              <span key={leaf.id} className="rounded-md bg-surface-2 px-2 py-1 text-xs text-content">
                {leaf.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2" role="tablist" aria-label={t('provider.optIn.pickServices')}>
        {groups.map(({ group, leaves }) => {
          const selectedCount = leaves.filter((leaf) => value.includes(leaf.id)).length;
          const expanded = group.id === activeGroup?.group.id;
          return (
            <button
              key={group.id}
              type="button"
              role="tab"
              aria-selected={expanded}
              aria-expanded={expanded}
              disabled={disabled}
              onClick={() => setActiveGroupId(group.id)}
              title={group.name}
              className={cn(
                'flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-colors',
                expanded
                  ? 'border-vfit-primary bg-vfit-primary/10 text-content'
                  : 'border-hairline text-content-muted hover:bg-surface-2'
              )}
            >
              <span className="min-w-0 leading-tight">
                <span className="mr-1" aria-hidden>{group.icon}</span>
                {group.name}
              </span>
              <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-content-muted">
                {selectedCount > 0 ? `${selectedCount}/` : ''}{leaves.length}
              </span>
            </button>
          );
        })}
      </div>

      {activeGroup && (
        <div role="tabpanel" aria-label={activeGroup.group.name} className="rounded-lg bg-surface-2 p-2">
          <div className="grid grid-cols-2 gap-2">
            {activeGroup.leaves.map((leaf) => {
              const selected = value.includes(leaf.id);
              return (
                <button
                  key={leaf.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={disabled}
                  onClick={() => toggle(leaf.id)}
                  className={cn(
                    'min-h-10 rounded-md border px-2 py-2 text-left text-xs transition-colors',
                    selected
                      ? 'border-vfit-primary bg-vfit-primary/10 font-semibold text-content'
                      : 'border-hairline text-content-muted hover:bg-surface-2'
                  )}
                >
                  <span className="mr-1" aria-hidden>{leaf.icon}</span>
                  {leaf.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
