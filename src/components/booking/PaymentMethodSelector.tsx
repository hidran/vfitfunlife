'use client';

import React, { useState } from 'react';
import {
  CreditCard,
  Wallet,
  MapPin,
  Plus,
  Check,
  Building2,
} from 'lucide-react';
import { cn, formatPrice } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import type { PaymentMethod } from '@/types/booking';

interface PaymentMethodInfo {
  id: string;
  type: 'card' | 'wallet' | 'cash';
  last4?: string;
  brand?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
}

interface PaymentMethodSelectorProps {
  methods: PaymentMethodInfo[];
  selectedMethod: string | null;
  onSelect: (methodId: string) => void;
  walletBalance?: number;
  allowCashAtVenue?: boolean;
  venueName?: string;
  totalAmount: number;
  className?: string;
}

const cardBrandIcons: Record<string, string> = {
  visa: 'VISA',
  mastercard: 'Mastercard',
  amex: 'Amex',
  discover: 'Discover',
};

export function PaymentMethodSelector({
  methods,
  selectedMethod,
  onSelect,
  walletBalance = 0,
  allowCashAtVenue = false,
  venueName,
  totalAmount,
  className,
}: PaymentMethodSelectorProps) {
  const [showAddCard, setShowAddCard] = useState(false);

  const savedCards = methods.filter((m) => m.type === 'card');
  const hasWallet = methods.some((m) => m.type === 'wallet');

  const renderCardIcon = (brand?: string) => {
    if (!brand) return <CreditCard className="w-5 h-5" />;
    
    return (
      <div className="w-8 h-5 bg-white/20 rounded flex items-center justify-center">
        <span className="text-[8px] font-bold text-white">
          {cardBrandIcons[brand.toLowerCase()] || brand.toUpperCase()}
        </span>
      </div>
    );
  };

  return (
    <div className={cn('space-y-3', className)}>
      {/* Saved Cards */}
      {savedCards.map((card) => (
        <PaymentMethodItem
          key={card.id}
          isSelected={selectedMethod === card.id}
          onClick={() => onSelect(card.id)}
          icon={renderCardIcon(card.brand)}
          title={`•••• ${card.last4}`}
          subtitle={card.expiryMonth && card.expiryYear 
            ? `Scadenza ${card.expiryMonth.toString().padStart(2, '0')}/${card.expiryYear}`
            : undefined
          }
          badge={card.isDefault ? 'Predefinita' : undefined}
        />
      ))}

      {/* Wallet */}
      {hasWallet && (
        <PaymentMethodItem
          isSelected={selectedMethod === 'wallet'}
          onClick={() => onSelect('wallet')}
          icon={<Wallet className="w-5 h-5 text-[var(--section-primary)]" />}
          title="Portafoglio VFit"
          subtitle={formatPrice(walletBalance)}
          disabled={walletBalance < totalAmount}
          disabledReason={walletBalance < totalAmount ? 'Saldo insufficiente' : undefined}
        />
      )}

      {/* Cash at Venue */}
      {allowCashAtVenue && (
        <PaymentMethodItem
          isSelected={selectedMethod === 'cash'}
          onClick={() => onSelect('cash')}
          icon={<MapPin className="w-5 h-5 text-warning" />}
          title="Paga in loco"
          subtitle={venueName ? `Presso ${venueName}` : 'Paga al momento del servizio'}
        />
      )}

      {/* Add New Card */}
      <button
        onClick={() => setShowAddCard(true)}
        className={cn(
          'w-full p-4 rounded-xl border-2 border-dashed border-white/20',
          'flex items-center gap-3 text-text-secondary hover:text-white hover:border-white/40',
          'transition-colors'
        )}
      >
        <Plus className="w-5 h-5" />
        <span className="font-medium">Aggiungi carta</span>
      </button>

      {/* Add Card Modal - Simplified placeholder */}
      {showAddCard && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#2A2D3A] rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">
              Aggiungi carta di credito
            </h3>
            <p className="text-text-secondary mb-6">
              Funzionalità di aggiunta carta in fase di implementazione.
            </p>
            <button
              onClick={() => setShowAddCard(false)}
              className="w-full bg-[var(--section-primary)] text-white py-3 rounded-xl font-medium"
            >
              Chiudi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface PaymentMethodItemProps {
  isSelected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: string;
  disabled?: boolean;
  disabledReason?: string;
}

function PaymentMethodItem({
  isSelected,
  onClick,
  icon,
  title,
  subtitle,
  badge,
  disabled,
  disabledReason,
}: PaymentMethodItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full p-4 rounded-xl border-2 transition-all duration-200',
        'flex items-center gap-3 text-left',
        isSelected
          ? 'border-[var(--section-primary)] bg-[var(--section-primary)]/10'
          : 'border-white/10 hover:border-white/20',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <div className="text-text-secondary">{icon}</div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn(
            'font-medium truncate',
            isSelected ? 'text-white' : 'text-text-secondary'
          )}>
            {title}
          </span>
          {badge && (
            <span className="text-[10px] bg-[var(--section-primary)]/20 text-[var(--section-primary)] px-2 py-0.5 rounded-full">
              {badge}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-sm text-text-tertiary">{subtitle}</p>
        )}
        {disabledReason && (
          <p className="text-xs text-error">{disabledReason}</p>
        )}
      </div>

      {isSelected && (
        <div className="w-6 h-6 rounded-full bg-[var(--section-primary)] flex items-center justify-center flex-shrink-0">
          <Check className="w-4 h-4 text-white" />
        </div>
      )}
    </button>
  );
}
