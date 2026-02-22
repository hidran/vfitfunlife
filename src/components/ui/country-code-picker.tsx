'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';

interface Country {
  code: string;
  dialCode: string;
  name: string;
  flag: string;
}

const countries: Country[] = [
  { code: 'IT', dialCode: '+39', name: 'Italia', flag: '🇮🇹' },
  { code: 'AT', dialCode: '+43', name: 'Austria', flag: '🇦🇹' },
  { code: 'BE', dialCode: '+32', name: 'Belgio', flag: '🇧🇪' },
  { code: 'HR', dialCode: '+385', name: 'Croazia', flag: '🇭🇷' },
  { code: 'FR', dialCode: '+33', name: 'Francia', flag: '🇫🇷' },
  { code: 'DE', dialCode: '+49', name: 'Germania', flag: '🇩🇪' },
  { code: 'GR', dialCode: '+30', name: 'Grecia', flag: '🇬🇷' },
  { code: 'NL', dialCode: '+31', name: 'Paesi Bassi', flag: '🇳🇱' },
  { code: 'PL', dialCode: '+48', name: 'Polonia', flag: '🇵🇱' },
  { code: 'PT', dialCode: '+351', name: 'Portogallo', flag: '🇵🇹' },
  { code: 'RO', dialCode: '+40', name: 'Romania', flag: '🇷🇴' },
  { code: 'SI', dialCode: '+386', name: 'Slovenia', flag: '🇸🇮' },
  { code: 'ES', dialCode: '+34', name: 'Spagna', flag: '🇪🇸' },
  { code: 'CH', dialCode: '+41', name: 'Svizzera', flag: '🇨🇭' },
  { code: 'GB', dialCode: '+44', name: 'Regno Unito', flag: '🇬🇧' },
  { code: 'US', dialCode: '+1', name: 'Stati Uniti', flag: '🇺🇸' },
];

interface CountryCodePickerProps {
  value: string;
  onChange: (dialCode: string) => void;
  className?: string;
}

export function CountryCodePicker({ value, onChange, className }: CountryCodePickerProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedCountry = countries.find((c) => c.dialCode === value) || countries[0];

  const filteredCountries = countries.filter(
    (country) =>
      country.name.toLowerCase().includes(search.toLowerCase()) ||
      country.dialCode.includes(search)
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={cn('relative', className)} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-3 py-3 bg-background-secondary/20 border border-white/10 rounded-xl',
          'hover:bg-background-secondary/35 transition-colors min-h-[52px]',
          'focus:outline-none focus:ring-2 focus:ring-section-primary'
        )}
      >
        <span className="text-xl">{selectedCountry.flag}</span>
        <span className="text-text-inverse font-medium">{selectedCountry.dialCode}</span>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-text-tertiary transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-background-dark border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
          <div className="p-2 border-b border-white/10">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`${t('common.search')}...`}
                className="w-full bg-background-secondary/20 border-0 rounded-lg pl-10 pr-3 py-2 text-sm text-text-inverse placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-section-primary"
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filteredCountries.map((country) => (
              <button
                key={country.code}
                type="button"
                onClick={() => {
                  onChange(country.dialCode);
                  setIsOpen(false);
                  setSearch('');
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors',
                  country.dialCode === value && 'bg-white/10'
                )}
              >
                <span className="text-xl">{country.flag}</span>
                <span className="text-text-inverse flex-1">{country.name}</span>
                <span className="text-text-tertiary">{country.dialCode}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
