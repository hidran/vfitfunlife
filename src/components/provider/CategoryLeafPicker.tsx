'use client';

import { useId, useState } from 'react';
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
 * Multi-select over the service taxonomy: a category dropdown, then that category's leaves
 * as toggle chips. Selections in other categories are kept and listed in the summary.
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

  const selectId = useId();

  return (
    <div className="space-y-3">
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

      {/* Step 1: the category is a plain dropdown, so it can't be mistaken for a choice. */}
      <div>
        <label htmlFor={selectId} className="mb-1 block text-xs font-semibold text-content-muted">
          {t('provider.optIn.categoryLabel')}
        </label>
        <select
          id={selectId}
          value={activeGroup?.group.id ?? ''}
          disabled={disabled}
          onChange={(e) => setActiveGroupId(e.target.value)}
          className="min-h-11 w-full rounded-lg border border-hairline bg-surface px-3 text-sm text-content"
        >
          {groups.map(({ group, leaves }) => {
            const selectedCount = leaves.filter((leaf) => value.includes(leaf.id)).length;
            return (
              <option key={group.id} value={group.id}>
                {group.icon} {group.name}
                {selectedCount > 0 ? ` (${selectedCount})` : ''}
              </option>
            );
          })}
        </select>
      </div>

      {/* Step 2: the services in that category — these are what gets selected. */}
      {activeGroup && (
        <fieldset>
          <legend className="mb-1 block text-xs font-semibold text-content-muted">
            {t('provider.optIn.servicesLabel')}
          </legend>
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
                    'min-h-11 rounded-md border px-2 py-2 text-left text-xs transition-colors',
                    selected
                      ? 'border-vfit-primary bg-vfit-primary/15 font-semibold text-content'
                      : 'border-hairline bg-surface text-content hover:bg-content/5'
                  )}
                >
                  <span className="mr-1" aria-hidden>{selected ? '✓' : leaf.icon}</span>
                  {leaf.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
    </div>
  );
}
