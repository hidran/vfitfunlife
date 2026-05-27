import { useCallback } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/stores/authStore';
import type { AppLocale } from '@/types/locale';

/**
 * Switch the active locale. Updates the i18n context + localStorage, and — when a
 * user is logged in — persists preferredLanguage to their Firestore doc so the
 * choice follows them across devices. A persist failure is logged, not thrown.
 */
export function useChangeLocale() {
  const { setLocale } = useI18n();
  return useCallback(
    async (locale: AppLocale) => {
      setLocale(locale);
      const { user, loadUserData } = useAuthStore.getState();
      if (!user?.uid) return;
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          preferredLanguage: locale,
          updatedAt: serverTimestamp(),
        });
        await loadUserData(user.uid);
      } catch (e) {
        console.error('[useChangeLocale] failed to persist preferredLanguage', e);
      }
    },
    [setLocale]
  );
}
