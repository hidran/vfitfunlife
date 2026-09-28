'use client';

import { useEffect, useRef } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/stores/authStore';
import { clearExplicitChoice, readExplicitChoice } from '@/lib/preferences/explicitChoice';
import { isSupportedLocale, type AppLocale } from '@/types/locale';

/**
 * Keeps the UI locale and the signed-in user's saved `preferredLanguage` in step.
 * Mounted ONCE, app-wide (src/app/providers.tsx), so it covers every shell — the
 * customer area, /admin and /provider alike.
 *
 * On login (and whenever the profile's language changes):
 * - If the user explicitly picked a locale while logged out (landing/login page), that
 *   choice wins: it's written to the profile when it differs, and the marker is cleared.
 * - Otherwise the profile wins (cross-device), and the UI switches to it.
 *
 * The theme counterpart lives in ThemeContext.
 */
export function useProfilePreferencesSync(): void {
  const uid = useAuthStore((s) => s.user?.uid ?? s.user?.id);
  const profileLocale = useAuthStore((s) => s.user?.preferredLanguage);
  const { locale, setLocale } = useI18n();

  // Read through a ref so a locale change alone (e.g. the user switching language while
  // logged in, before the profile reload lands) never re-runs the sync and reverts it.
  const localeRef = useRef(locale);
  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  // The uid whose login has already consumed the explicit pre-login marker.
  const handledUid = useRef<string | null>(null);

  useEffect(() => {
    if (!uid) {
      handledUid.current = null;
      return;
    }

    if (handledUid.current !== uid) {
      handledUid.current = uid;
      const explicit = readExplicitChoice('locale');
      if (explicit && isSupportedLocale(explicit.value)) {
        const chosen: AppLocale = explicit.value;
        clearExplicitChoice('locale');
        if (localeRef.current !== chosen) void setLocale(chosen);
        if (profileLocale !== chosen) {
          void updateDoc(doc(db, 'users', uid), {
            preferredLanguage: chosen,
            updatedAt: serverTimestamp(),
          })
            .then(() => {
              // Mirror the write locally so the profile and the UI agree without a re-read.
              useAuthStore.setState((state) =>
                state.user && (state.user.uid ?? state.user.id) === uid
                  ? { user: { ...state.user, preferredLanguage: chosen } }
                  : {},
              );
            })
            .catch((error) => {
              console.error('[preferences] failed to save pre-login locale choice', error);
            });
        }
        return;
      }
      if (explicit) clearExplicitChoice('locale');
    }

    if (profileLocale && isSupportedLocale(profileLocale) && profileLocale !== localeRef.current) {
      void setLocale(profileLocale);
    }
  }, [uid, profileLocale, setLocale]);
}

/** Render-nothing mount point for {@link useProfilePreferencesSync}. */
export function ProfilePreferencesSync(): null {
  useProfilePreferencesSync();
  return null;
}
