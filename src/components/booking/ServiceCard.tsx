'use client';

import React from 'react';
import { Clock, Check } from 'lucide-react';
import { cn, formatPrice } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/button';
import type { Service } from '@/types/booking';

interface ServiceCardProps {
  service: Service;
  isSelected?: boolean;
  onSelect?: (service: Service) => void;
  className?: string;
}

export function ServiceCard({
  service,
  isSelected = false,
  onSelect,
  className,
}: ServiceCardProps) {
  const durationHours = Math.floor(service.durationMinutes / 60);
  const durationMins = service.durationMinutes % 60;
  const durationText =
    durationHours > 0
      ? `${durationHours}h${durationMins > 0 ? ` ${durationMins}m` : ''}`
      : `${durationMins} min`;

  return (
    <Card
      className={cn(
        'p-4 transition-all duration-200',
        isSelected && 'ring-2 ring-[var(--section-primary)] bg-[var(--section-primary)]/5',
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white truncate">{service.name}</h3>
          
          {service.description && (
            <p className="text-sm text-text-secondary mt-1 line-clamp-2">
              {service.description}
            </p>
          )}
          
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-1.5 text-sm text-text-secondary">
              <Clock className="w-4 h-4 text-[var(--section-primary)]" />
              <span>{durationText}</span>
            </div>
            
            <span className="text-lg font-bold text-[var(--section-primary)]">
              {formatPrice(service.price)}
            </span>
          </div>
        </div>

        <Button
          variant={isSelected ? 'primary' : 'outline'}
          size="sm"
          onClick={() => onSelect?.(service)}
          className="flex-shrink-0"
        >
          {isSelected ? (
            <>
              <Check className="w-4 h-4 mr-1" />
              Selezionato
            </>
          ) : (
            'Seleziona'
          )}
        </Button>
      </div>
    </Card>
  );
}
