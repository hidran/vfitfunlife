'use client';

import { useState } from 'react';
import { Instagram, Linkedin, Globe, Facebook, Twitter, Music, Check, X, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  SocialLinksFields,
  focusFirstInvalidSocialField,
  socialLinkErrorMessageKey,
  type SocialLinkErrors,
} from '@/components/profile/SocialLinksFields';
import { Button } from '@/components/ui/button';
import { updateSocialLinks } from '@/lib/firebase/auth';
import { SocialLinks } from '@/types/firebase';
import { useI18n } from '@/hooks/useI18n';
import { normalizeSocialLinks, socialLinkHref, type SocialLinkKey } from '@/lib/socialLinks';
import type { MessageKey } from '@/i18n/messages';

interface SocialLinksEditorProps {
  userId: string;
  socialLinks: SocialLinks | null;
  onUpdate?: (links: SocialLinks) => void;
  className?: string;
}

const socialPlatforms = [
  {
    key: 'instagram',
    labelKey: 'profile.social.platform.instagram',
    icon: Instagram,
    placeholderKey: 'profile.social.placeholder.instagram',
    color: '#E4405F',
    formatErrorKey: 'profile.social.validation.instagram',
  },
  {
    key: 'linkedin',
    labelKey: 'profile.social.platform.linkedin',
    icon: Linkedin,
    placeholderKey: 'profile.social.placeholder.linkedin',
    color: '#0A66C2',
    formatErrorKey: 'profile.social.validation.linkedin',
  },
  {
    key: 'website',
    labelKey: 'profile.social.platform.website',
    icon: Globe,
    placeholderKey: 'profile.social.placeholder.website',
    color: '#10B981',
    formatErrorKey: 'profile.social.validation.website',
  },
  {
    key: 'facebook',
    labelKey: 'profile.social.platform.facebook',
    icon: Facebook,
    placeholderKey: 'profile.social.placeholder.facebook',
    color: '#1877F2',
    formatErrorKey: 'profile.social.validation.facebook',
  },
  {
    key: 'twitter',
    labelKey: 'profile.social.platform.twitter',
    icon: Twitter,
    placeholderKey: 'profile.social.placeholder.twitter',
    color: '#1DA1F2',
    formatErrorKey: 'profile.social.validation.twitter',
  },
  {
    key: 'tiktok',
    labelKey: 'profile.social.platform.tiktok',
    icon: Music,
    placeholderKey: 'profile.social.placeholder.tiktok',
    color: '#25F4EE',
    formatErrorKey: 'profile.social.validation.tiktok',
  },
] as const;

export function SocialLinksEditor({
  userId,
  socialLinks,
  onUpdate,
  className,
}: SocialLinksEditorProps) {
  const { t } = useI18n();
  const [links, setLinks] = useState<Record<string, string>>({ ...((socialLinks as Record<string, string> | null) ?? {}) });
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [validationErrors, setValidationErrors] = useState<SocialLinkErrors>({});

  const handleChange = (key: SocialLinkKey, value: string) => {
    setLinks((prev) => ({ ...prev, [key]: value }));
    setValidationErrors((prev) => ({ ...prev, [key]: undefined }));
    setError(null);
  };

  const handleSave = async () => {
    // The one validator of the profile editor (src/lib/socialLinks.ts): bare hosts and @handles
    // are normalised, anything else is refused before a write is attempted.
    const { links: normalised, invalid } = normalizeSocialLinks(links);
    if (invalid.length > 0) {
      const errors: SocialLinkErrors = {};
      for (const key of invalid) errors[key] = t(socialLinkErrorMessageKey(key));
      setValidationErrors(errors);
      setError(t('profile.social.error.fixBeforeSave'));
      focusFirstInvalidSocialField(invalid);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await updateSocialLinks(userId, normalised as SocialLinks);
      setLinks(normalised);
      setSuccess(true);
      onUpdate?.(normalised as SocialLinks);
      setIsEditing(false);
      
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving social links:', err);
      setError(t('profile.social.error.save'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setLinks({ ...((socialLinks as Record<string, string> | null) ?? {}) });
    setIsEditing(false);
    setError(null);
    setValidationErrors({});
  };

  const hasLinks = Object.values(links).some((v) => v && v.length > 0);

  if (!isEditing) {
    return (
      <div className={cn('space-y-3', className)}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-tertiary">{t('profile.social.title')}</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(true)}
          >
            {hasLinks ? t('profile.social.edit') : t('profile.social.add')}
          </Button>
        </div>

        {hasLinks ? (
          <div className="flex flex-wrap gap-2">
            {socialPlatforms.map((platform) => {
              const value = links[platform.key];
              if (!value) return null;

              // Stored values are user-written: only a safe http(s) URL becomes a link.
              const href = socialLinkHref(value, platform.key);
              const pillClass =
                'inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-content/10 text-text-inverse text-sm';
              const content = (
                <>
                  <platform.icon size={14} style={{ color: platform.color }} />
                  <span className="truncate max-w-[120px]">
                    {value.replace(/^https?:\/\//, '').replace(/^@/, '')}
                  </span>
                </>
              );

              return href ? (
                <a
                  key={platform.key}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${pillClass} hover:bg-content/20 transition-colors`}
                  style={{ borderLeft: `3px solid ${platform.color}` }}
                >
                  {content}
                </a>
              ) : (
                <span
                  key={platform.key}
                  className={pillClass}
                  style={{ borderLeft: `3px solid ${platform.color}` }}
                >
                  {content}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-text-tertiary italic">
            {t('profile.social.empty')}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-tertiary">{t('profile.social.editTitle')}</h3>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            disabled={isSaving}
          >
            <X size={16} />
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            isLoading={isSaving}
          >
            <Check size={16} />
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-error/10 text-error text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <SocialLinksFields values={links} errors={validationErrors} onChange={handleChange} />

      <p className="text-xs text-text-tertiary">
        {t('profile.social.hint')}
      </p>

      {success && (
        <p className="text-sm text-success-DEFAULT text-center">
          {t('profile.social.saved')}
        </p>
      )}
    </div>
  );
}
