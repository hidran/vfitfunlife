'use client';

import { Input } from '@/components/ui/input';
import { useI18n } from '@/hooks/useI18n';
import type { MessageKey } from '@/i18n/messages';
import { SOCIAL_LINK_KEYS, socialFieldId, type SocialLinkKey } from '@/lib/socialLinks';

/**
 * THE social-links form fields (one component for the whole profile editor): a labelled input
 * per platform, each showing its own error with `aria-invalid` and `aria-describedby`. The value
 * is checked and normalised by `normalizeSocialLinks` (src/lib/socialLinks.ts) before anything is
 * saved; on a refusal the caller focuses the first invalid field with `focusFirstInvalidSocialField`.
 */
export type SocialLinkErrors = Partial<Record<SocialLinkKey, string>>;

export function socialLinkErrorMessageKey(key: SocialLinkKey): MessageKey {
  return `profile.social.validation.${key}` as MessageKey;
}

/** Move focus to the first invalid field, in field order. */
export function focusFirstInvalidSocialField(invalid: readonly SocialLinkKey[]) {
  const first = SOCIAL_LINK_KEYS.find((key) => invalid.includes(key));
  if (first) document.getElementById(socialFieldId(first))?.focus();
}

interface Props {
  values: Partial<Record<string, string | null>>;
  errors: SocialLinkErrors;
  onChange: (key: SocialLinkKey, value: string) => void;
}

export function SocialLinksFields({ values, errors, onChange }: Props) {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      {SOCIAL_LINK_KEYS.map((key) => (
        <Input
          key={key}
          id={socialFieldId(key)}
          label={t(`profile.social.platform.${key}` as MessageKey)}
          placeholder={t(`profile.social.placeholder.${key}` as MessageKey)}
          value={values[key] || ''}
          onChange={(e) => onChange(key, e.target.value)}
          error={errors[key]}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
      ))}
    </div>
  );
}
