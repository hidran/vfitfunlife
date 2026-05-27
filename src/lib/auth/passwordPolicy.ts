export const PASSWORD_MIN_LENGTH = 12;

export type PasswordRuleId = 'minLength' | 'lowercase' | 'uppercase' | 'number' | 'symbol';

export interface PasswordRuleResult {
  id: PasswordRuleId;
  met: boolean;
}

export interface PasswordStrength {
  valid: boolean;
  rules: PasswordRuleResult[];
}

/** Validate a password against the strong-password policy: min length + 4 character classes. Pure; no i18n. */
export function validatePasswordStrength(password: string): PasswordStrength {
  const rules: PasswordRuleResult[] = [
    { id: 'minLength', met: password.length >= PASSWORD_MIN_LENGTH },
    { id: 'lowercase', met: /[a-z]/.test(password) },
    { id: 'uppercase', met: /[A-Z]/.test(password) },
    { id: 'number', met: /[0-9]/.test(password) },
    { id: 'symbol', met: /[^A-Za-z0-9]/.test(password) },
  ];
  return { valid: rules.every((r) => r.met), rules };
}
