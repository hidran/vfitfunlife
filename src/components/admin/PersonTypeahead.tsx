'use client';
import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Avatar } from '@/components/ui/Avatar';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useI18n } from '@/hooks/useI18n';

/** One row of a people search: an account the admin can pick. */
export interface PersonOption {
  id: string;
  name: string;
  /** Second line: email, account kind, ... */
  subtitle?: string;
  avatarUrl?: string | null;
}

interface PersonTypeaheadProps {
  label: string;
  placeholder: string;
  /** Message shown when a search finds nobody. */
  emptyText: string;
  /** The server-side search; called with the debounced, non-empty query. */
  search: (query: string) => Promise<PersonOption[]>;
  /** Accounts not to offer (already linked, for instance). */
  excludeIds?: string[];
  /** Query-key prefix so two typeaheads on one page do not share results. */
  queryKey: string;
  onSelect: (person: PersonOption) => void;
}

const MIN_QUERY = 2;

/**
 * A combobox over an admin people search (users or providers), after CourseCategoryCombobox:
 * typing runs the debounced server search, the list is a listbox with arrow-key navigation,
 * picking a row hands the account up and clears the box. Rows show avatar, name and a subtitle.
 */
export function PersonTypeahead({ label, placeholder, emptyText, search, excludeIds, queryKey, onSelect }: PersonTypeaheadProps) {
  const { t } = useI18n();
  const id = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const query = useDebouncedValue(text.trim(), 250);
  const enabled = query.length >= MIN_QUERY;
  const results = useQuery({
    queryKey: ['admin', 'typeahead', queryKey, query],
    queryFn: () => search(query),
    enabled,
    staleTime: 30_000,
  });
  const options = (results.data ?? []).filter((p) => !excludeIds?.includes(p.id));
  const showList = open && enabled;

  function choose(index: number) {
    const picked = options[index];
    if (!picked) return;
    onSelect(picked);
    setText('');
    setOpen(false);
    setActive(-1);
  }

  return (
    <div className="relative space-y-1 text-sm">
      <label htmlFor={id} className="text-xs text-content-muted">{label}</label>
      <input
        id={id}
        role="combobox"
        autoComplete="off"
        placeholder={placeholder}
        className="admin-input min-h-[44px]"
        aria-expanded={showList}
        aria-autocomplete="list"
        aria-controls={`${id}-options`}
        aria-activedescendant={showList && active >= 0 ? `${id}-option-${active}` : undefined}
        value={text}
        onFocus={() => setOpen(true)}
        onBlur={() => { setOpen(false); setActive(-1); }}
        onChange={(e) => { setText(e.target.value); setOpen(true); setActive(-1); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
            setActive((i) => options.length
              ? (i < 0 ? (e.key === 'ArrowDown' ? 0 : options.length - 1)
                : (i + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
              : -1);
          } else if (e.key === 'Enter' && showList) { e.preventDefault(); choose(active); }
          else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setActive(-1); }
        }}
      />
      {showList && (
        <ul
          id={`${id}-options`}
          role="listbox"
          aria-label={label}
          className="absolute z-20 max-h-72 w-full overflow-auto rounded-xl border border-hairline bg-surface shadow-lg"
        >
          {results.isPending && <li className="p-3 text-content-muted">{t('common.loading')}</li>}
          {!results.isPending && options.length === 0 && <li className="p-3 text-content-muted">{emptyText}</li>}
          {options.map((p, i) => (
            <li key={p.id} id={`${id}-option-${i}`} role="option" aria-selected={i === active} className={i === active ? 'bg-surface-2' : ''}>
              <button
                type="button"
                tabIndex={-1}
                className="flex min-h-[44px] w-full items-center gap-3 p-3 text-left hover:bg-surface-2"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
              >
                <Avatar src={p.avatarUrl} name={p.name} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-content">{p.name}</span>
                  {p.subtitle && <span className="block truncate text-xs text-content-muted">{p.subtitle}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
