'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { SocialLinksSchema, type SocialLinks } from '@/types/profile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUpdateSocialLinks } from '@/lib/profile-mutations';
import { Instagram, Facebook, Twitter, Linkedin, Globe, Music } from 'lucide-react';

interface Props { initial: SocialLinks; onSaved?: () => void; }

const fields: Array<{ name: keyof SocialLinks; label: string; icon: React.ComponentType<any>; placeholder: string }> = [
  { name: 'instagram', label: 'Instagram',   icon: Instagram, placeholder: 'https://instagram.com/your_handle' },
  { name: 'facebook',  label: 'Facebook',    icon: Facebook,  placeholder: 'https://facebook.com/your.page' },
  { name: 'twitter',   label: 'Twitter / X', icon: Twitter,   placeholder: 'https://x.com/your_handle' },
  { name: 'linkedin',  label: 'LinkedIn',    icon: Linkedin,  placeholder: 'https://linkedin.com/in/your-name' },
  { name: 'tiktok',    label: 'TikTok',      icon: Music,     placeholder: 'https://tiktok.com/@your_handle' },
  { name: 'website',   label: 'Website',     icon: Globe,     placeholder: 'https://example.com' },
];

export function SocialLinksForm({ initial, onSaved }: Props) {
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
      {fields.map(({ name, label, icon: Icon, placeholder }) => (
        <div key={name}>
          <label htmlFor={`social-${name}`} className="flex items-center gap-2 text-sm font-medium">
            <Icon className="h-4 w-4" /> {label}
          </label>
          <Input id={`social-${name}`} type="text" placeholder={placeholder} {...register(name)} />
          {formState.errors[name] && (
            <p className="mt-1 text-xs text-error">{String(formState.errors[name]?.message)}</p>
          )}
        </div>
      ))}
      <Button type="submit" isLoading={mut.isPending}>Save</Button>
    </form>
  );
}
