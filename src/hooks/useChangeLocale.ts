import { useCallback } from 'react';
// Lazy Firestore: the language switcher is on the landing page and other signed-out
// routes, which must not pay for the Firestore SDK up front.
import { loadFirestore } from '@/lib/firebase/lazyFirestore';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/stores/authStore';
import { clearExplicitChoice, markExplicitChoice } from '@/lib/preferences/explicitChoice';
import type { AppLocale } from '@/types/locale';

/**
 * Switch the active locale. Updates the i18n context + localStorage, and — when a
 * user is logged in — persists preferredLanguage to their Firestore doc so the
 * choice follows them across devices. A persist failure is logged, not thrown.
 *
 * Logged out, the choice is marked as explicit so that the next login writes it to the
 * profile instead of being overwritten by it (see useProfilePreferencesSync).
 */
export function useChangeLocale() {
  const { setLocale } = useI18n();
  return useCallback(
    async (locale: AppLocale) => {
      await setLocale(locale);
      const { user, loadUserData } = useAuthStore.getState();
      if (!user?.uid) {
        markExplicitChoice('locale', locale);
        return;
      }
      clearExplicitChoice('locale');
      try {
        const { db, doc, updateDoc, serverTimestamp } = await loadFirestore();
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
