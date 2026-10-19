'use client';
import { useEffect, useId, useRef, useState } from 'react';

export function CourseCategoryCombobox({ categories, locale, label, placeholder, value, onChange }: {
  categories: { id: string; name: string }[]; locale: string; label: string; placeholder: string;
  value: string; onChange: (id: string) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const selected = categories.find(c => c.id === value);
  const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase(locale);
  const options = [...categories].sort((a, b) => a.name.localeCompare(b.name, locale, { sensitivity: 'base' }))
    .filter(c => search === null || normalize(c.name).includes(normalize(search)));
  useEffect(() => { input.current?.setCustomValidity(value ? '' : placeholder); }, [value, placeholder]);
  function choose(index: number) {
    if (!options[index]) return;
    onChange(options[index].id); setSearch(null); setOpen(false); setActive(-1);
  }
  return <div className="relative space-y-1 text-sm">
    <label htmlFor={id}>{label}</label>
    <input ref={input} id={id} role="combobox" required autoComplete="off" placeholder={placeholder}
      className="w-full rounded-xl border border-hairline bg-surface p-3 text-content"
      aria-expanded={open} aria-autocomplete="list" aria-controls={`${id}-options`}
      aria-activedescendant={open && active >= 0 ? `${id}-option-${active}` : undefined}
      value={search ?? selected?.name ?? ''} onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
      onBlur={() => { setOpen(false); setSearch(null); setActive(-1); }}
      onChange={e => { setSearch(e.target.value); onChange(''); setOpen(true); setActive(-1); }}
      onKeyDown={e => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault(); setOpen(true);
          setActive(i => options.length ? (i < 0 ? (e.key === 'ArrowDown' ? 0 : options.length - 1) :
            (i + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length) : -1);
        } else if (e.key === 'Enter' && open) { e.preventDefault(); choose(active); }
        else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setSearch(null); setActive(-1); }
      }} />
    {open && <ul id={`${id}-options`} role="listbox" aria-label={label}
      className="absolute z-20 max-h-64 w-full overflow-auto rounded-xl border border-hairline bg-surface shadow-lg">
      {options.map((c, i) => <li key={c.id} id={`${id}-option-${i}`} role="option" aria-selected={c.id === value}
        className={i === active ? 'bg-surface-2' : ''}>
        <button type="button" tabIndex={-1} className="w-full p-3 text-left hover:bg-surface-2"
          onMouseDown={e => e.preventDefault()} onClick={() => choose(i)}>{c.name}</button>
      </li>)}
    </ul>}
  </div>;
}
