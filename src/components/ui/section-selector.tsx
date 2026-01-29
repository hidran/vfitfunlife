'use client';

import { cn } from '@/lib/utils';
import { Dumbbell, PartyPopper, Heart } from 'lucide-react';

type Section = 'fit' | 'fun' | 'life';

interface SectionSelectorProps {
  value: Section;
  onChange: (value: Section) => void;
  error?: string;
}

const sections: { id: Section; name: string; icon: typeof Dumbbell; description: string; gradient: string }[] = [
  {
    id: 'fit',
    name: 'VFit',
    icon: Dumbbell,
    description: 'Fitness & Sport',
    gradient: 'from-[#00C9FF] to-[#0066FF]',
  },
  {
    id: 'fun',
    name: 'VFun',
    icon: PartyPopper,
    description: 'Eventi & Intrattenimento',
    gradient: 'from-[#B461FF] to-[#FF00E5]',
  },
  {
    id: 'life',
    name: 'VLife',
    icon: Heart,
    description: 'Wellness & Beauty',
    gradient: 'from-[#00E676] to-[#76FF03]',
  },
];

export function SectionSelector({ value, onChange, error }: SectionSelectorProps) {
  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-text-tertiary mb-3">
        Sezione preferita
      </label>
      <div className="grid grid-cols-3 gap-3">
        {sections.map((section) => {
          const Icon = section.icon;
          const isSelected = value === section.id;

          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onChange(section.id)}
              className={cn(
                'relative flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all duration-200',
                'min-h-[100px] touch-target',
                isSelected
                  ? 'border-transparent bg-gradient-to-br ' + section.gradient
                  : 'border-white/10 bg-[#2A2D3A] hover:bg-[#3A3D4A]'
              )}
            >
              <Icon
                className={cn(
                  'w-8 h-8 mb-2 transition-colors',
                  isSelected ? 'text-white' : 'text-text-tertiary'
                )}
              />
              <span
                className={cn(
                  'text-sm font-semibold transition-colors',
                  isSelected ? 'text-white' : 'text-text-inverse'
                )}
              >
                {section.name}
              </span>
              <span
                className={cn(
                  'text-xs mt-0.5 text-center transition-colors',
                  isSelected ? 'text-white/80' : 'text-text-tertiary'
                )}
              >
                {section.description}
              </span>
              {isSelected && (
                <div className="absolute top-2 right-2 w-2 h-2 bg-white rounded-full" />
              )}
            </button>
          );
        })}
      </div>
      {error && (
        <p className="mt-2 text-sm text-error animate-fade-in">{error}</p>
      )}
    </div>
  );
}
