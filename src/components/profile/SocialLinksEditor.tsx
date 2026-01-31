'use client';

import { useState, useCallback } from 'react';
import { Instagram, Linkedin, Globe, Facebook, Twitter, Link as LinkIcon, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/Spinner';
import { updateSocialLinks } from '@/lib/firebase/auth';
import { SocialLinks } from '@/types/firebase';

interface SocialLinksEditorProps {
  userId: string;
  socialLinks: SocialLinks | null;
  onUpdate?: (links: SocialLinks) => void;
  className?: string;
}

const socialPlatforms = [
  { key: 'instagram', label: 'Instagram', icon: Instagram, placeholder: '@username', color: '#E4405F' },
  { key: 'linkedin', label: 'LinkedIn', icon: Linkedin, placeholder: 'linkedin.com/in/username', color: '#0A66C2' },
  { key: 'website', label: 'Website', icon: Globe, placeholder: 'yourwebsite.com', color: '#10B981' },
  { key: 'facebook', label: 'Facebook', icon: Facebook, placeholder: 'facebook.com/username', color: '#1877F2' },
  { key: 'twitter', label: 'Twitter/X', icon: Twitter, placeholder: '@username', color: '#1DA1F2' },
] as const;

export function SocialLinksEditor({
  userId,
  socialLinks,
  onUpdate,
  className,
}: SocialLinksEditorProps) {
  const [links, setLinks] = useState<SocialLinks>(socialLinks || {});
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (key: keyof SocialLinks, value: string) => {
    setLinks((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };

  const validateUrl = (url: string): boolean => {
    if (!url) return true;
    // Allow URLs with or without protocol
    const urlPattern = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;
    const handlePattern = /^@?[\w.]+$/;
    return urlPattern.test(url) || handlePattern.test(url);
  };

  const handleSave = async () => {
    // Validate URLs
    for (const [key, value] of Object.entries(links)) {
      if (value && !validateUrl(value)) {
        setError(`Invalid URL or handle for ${key}`);
        return;
      }
    }

    setIsSaving(true);
    setError(null);

    try {
      await updateSocialLinks(userId, links);
      setSuccess(true);
      onUpdate?.(links);
      setIsEditing(false);
      
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving social links:', err);
      setError('Failed to save social links');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setLinks(socialLinks || {});
    setIsEditing(false);
    setError(null);
  };

  const formatUrl = (url?: string, key?: string): string => {
    if (!url) return '';
    
    // If it's just a handle (starts with @ or has no dots), format it
    if (url.startsWith('@')) {
      return url;
    }
    
    // If it doesn't have a protocol, add https://
    if (!url.startsWith('http')) {
      return `https://${url}`;
    }
    
    return url;
  };

  const hasLinks = Object.values(links).some((v) => v && v.length > 0);

  if (!isEditing) {
    return (
      <div className={cn('space-y-3', className)}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-tertiary">Social Links</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(true)}
          >
            {hasLinks ? 'Edit' : 'Add'}
          </Button>
        </div>

        {hasLinks ? (
          <div className="flex flex-wrap gap-2">
            {socialPlatforms.map((platform) => {
              const value = links[platform.key as keyof SocialLinks];
              if (!value) return null;

              return (
                <a
                  key={platform.key}
                  href={formatUrl(value, platform.key)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-background-secondary/10 text-text-inverse text-sm hover:bg-background-secondary/20 transition-colors"
                  style={{ borderLeft: `3px solid ${platform.color}` }}
                >
                  <platform.icon size={14} style={{ color: platform.color }} />
                  <span className="truncate max-w-[120px]">
                    {value.replace(/^https?:\/\//, '').replace(/^@/, '')}
                  </span>
                </a>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-text-tertiary italic">
            No social links added yet
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-tertiary">Edit Social Links</h3>
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

      <div className="space-y-3">
        {socialPlatforms.map((platform) => (
          <div key={platform.key} className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${platform.color}20` }}
            >
              <platform.icon size={16} style={{ color: platform.color }} />
            </div>
            <Input
              label={platform.label}
              placeholder={platform.placeholder}
              value={links[platform.key as keyof SocialLinks] || ''}
              onChange={(e) => handleChange(platform.key as keyof SocialLinks, e.target.value)}
              className="flex-1"
            />
          </div>
        ))}
      </div>

      {error && (
        <p className="text-sm text-error">{error}</p>
      )}

      {success && (
        <p className="text-sm text-success-DEFAULT">Social links saved successfully!</p>
      )}
    </div>
  );
}
