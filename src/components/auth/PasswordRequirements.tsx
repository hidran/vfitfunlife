'use client';

import { Check, X } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { validatePasswordStrength, type PasswordRuleId } from '@/lib/auth/passwordPolicy';
import type { MessageKey } from '@/i18n/messages';
import { cn } from '@/lib/utils';

const RULE_LABEL_KEYS: Record<PasswordRuleId, MessageKey> = {
  minLength: 'auth.password.rule.minLength',
  lowercase: 'auth.password.rule.lowercase',
  uppercase: 'auth.password.rule.uppercase',
  number: 'auth.password.rule.number',
  symbol: 'auth.password.rule.symbol',
};

export function PasswordRequirements({ password }: { password: string }) {
  const { t } = useI18n();
  const { rules } = validatePasswordStrength(password);

  return (
    <ul className="mt-2 space-y-1">
      {rules.map((rule) => (
        <li
          key={rule.id}
          className={cn(
            'flex items-center gap-2 text-xs',
            rule.met ? 'text-success-DEFAULT' : 'text-text-tertiary'
          )}
        >
          {rule.met ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5 opacity-60" />}
          {t(RULE_LABEL_KEYS[rule.id])}
        </li>
      ))}
    </ul>
  );
}
