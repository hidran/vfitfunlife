'use client';

import { cn } from '@/lib/utils';

interface DividerProps {
  text?: string;
  className?: string;
}

export function Divider({ text, className }: DividerProps) {
  if (!text) {
    return <hr className={cn('border-white/10', className)} />;
  }

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <div className="flex-1 h-px bg-white/10" />
      <span className="text-sm text-text-tertiary">{text}</span>
      <div className="flex-1 h-px bg-white/10" />
    </div>
  );
}
