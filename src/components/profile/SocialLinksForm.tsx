'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { SocialLinksSchema, type SocialLinks } from '@/types/profile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUpdateSocialLinks } from '@/lib/profile-mutations';
import { Instagram, Facebook, Twitter, Linkedin, Globe, Music } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';

interface Props { initial: SocialLinks; onSaved?: () => void; }

type SocialFieldDef = { name: keyof SocialLinks; icon: React.ComponentType<any>; placeholder: string };

const fieldDefs: SocialFieldDef[] = [
  { name: 'instagram', icon: Instagram, placeholder: 'https://instagram.com/your_handle' },
  { name: 'facebook',  icon: Facebook,  placeholder: 'https://facebook.com/your.page' },
  { name: 'twitter',   icon: Twitter,   placeholder: 'https://x.com/your_handle' },
  { name: 'linkedin',  icon: Linkedin,  placeholder: 'https://linkedin.com/in/your-name' },
  { name: 'tiktok',    icon: Music,     placeholder: 'https://tiktok.com/@your_handle' },
  { name: 'website',   icon: Globe,     placeholder: 'https://example.com' },
];

export function SocialLinksForm({ initial, onSaved }: Props) {
  const { t } = useI18n();
  const mut = useUpdateSocialLinks();
  const { register, handleSubmit, formState } = useForm<SocialLinks>({
    resolver: zodResolver(SocialLinksSchema),
    defaultValues: initial,
  });

  return (
    <form
      className="space-y-4"
      onSubmit={handleSubmit(async (data) => {
        await mut.mutateAsync(data);
        onSaved?.();
      })}
    >
      {fieldDefs.map(({ name, icon: Icon, placeholder }) => (
        <div key={name}>
          <label htmlFor={`social-${name}`} className="flex items-center gap-2 text-sm font-medium">
            <Icon className="h-4 w-4" /> {t(`profile.settings.social.${name}` as any)}
          </label>
          <Input id={`social-${name}`} type="text" placeholder={placeholder} {...register(name)} />
          {formState.errors[name] && (
            <p className="mt-1 text-xs text-error">{String(formState.errors[name]?.message)}</p>
          )}
        </div>
      ))}
      <Button type="submit" isLoading={mut.isPending}>{t('profile.settings.save')}</Button>
    </form>
  );
}
