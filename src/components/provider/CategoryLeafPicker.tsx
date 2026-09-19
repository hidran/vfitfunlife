'use client';

import { useServiceCategoryGroups } from '@/hooks/useServiceCategories';
import { cn } from '@/lib/utils';

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

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="space-y-3">
      {groups.map(({ group, leaves }) => (
        <div key={group.id}>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-content-muted">
            <span className="mr-1" aria-hidden>{group.icon}</span>
            {group.name}
          </p>
          <div className="flex flex-wrap gap-2">
            {leaves.map((leaf) => {
              const selected = value.includes(leaf.id);
              return (
                <button
                  key={leaf.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={disabled}
                  onClick={() => toggle(leaf.id)}
                  className={cn(
                    'min-h-[44px] rounded-lg border px-3 py-2 text-sm transition-colors',
                    selected
                      ? 'border-vfit-primary bg-vfit-primary/10 text-content'
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
      ))}
    </div>
  );
}
