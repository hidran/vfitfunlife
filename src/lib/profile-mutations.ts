'use client';
import { httpsCallable } from 'firebase/functions';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getFunctionsInstance } from '@/lib/firebase/config';
import type {
  SocialLinks,
  NotificationSettings,
  PrivacySettings,
} from '@/types/profile';
import { useAuthStore } from '@/stores/authStore';

export function useUpdateAvatar() {
  const qc = useQueryClient();
  const uid = useAuthStore((s) => s.user?.uid);
  return useMutation({
    mutationFn: async (avatarUrl: string) => {
      const functions = await getFunctionsInstance();
      const fn = httpsCallable<{ avatarUrl: string }, { success: true; avatarUrl: string; previousUrl: string | null }>(
        functions, 'updateAvatar'
      );
      const r = await fn({ avatarUrl });
      return r.data;
    },
    onSuccess: () => uid && qc.invalidateQueries({ queryKey: ['user', uid] }),
  });
}

export function useUpdateSocialLinks() {
  const qc = useQueryClient();
  const uid = useAuthStore((s) => s.user?.uid);
  return useMutation({
    mutationFn: async (socialLinks: SocialLinks) => {
      const functions = await getFunctionsInstance();
      const fn = httpsCallable<{ socialLinks: SocialLinks }, { success: true }>(functions, 'updateSocialLinks');
      const r = await fn({ socialLinks });
      return r.data;
    },
    onSuccess: () => uid && qc.invalidateQueries({ queryKey: ['user', uid] }),
  });
}

export function useUpdateNotificationSettings() {
  const qc = useQueryClient();
  const uid = useAuthStore((s) => s.user?.uid);
  return useMutation({
    mutationFn: async (settings: NotificationSettings) => {
      const functions = await getFunctionsInstance();
      const fn = httpsCallable<{ settings: NotificationSettings }, { success: true }>(
        functions, 'updateNotificationSettings'
      );
      const r = await fn({ settings });
      return r.data;
    },
    onSuccess: () => uid && qc.invalidateQueries({ queryKey: ['user', uid] }),
  });
}

export function useUpdatePrivacySettings() {
  const qc = useQueryClient();
  const uid = useAuthStore((s) => s.user?.uid);
  return useMutation({
    mutationFn: async (settings: PrivacySettings) => {
      const functions = await getFunctionsInstance();
      const fn = httpsCallable<{ settings: PrivacySettings }, { success: true }>(
        functions, 'updatePrivacySettings'
      );
      const r = await fn({ settings });
      return r.data;
    },
    onSuccess: () => uid && qc.invalidateQueries({ queryKey: ['user', uid] }),
  });
}
