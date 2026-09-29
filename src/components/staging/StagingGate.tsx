'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/stores/authStore';
import { loadFirestore } from '@/lib/firebase/lazyFirestore';
import {
  STAGING_ALLOWLIST_COLLECTION,
  STAGING_GATE_ATTR,
  decideStagingGate,
  isStagingHost,
  prodUrlFor,
} from '@/lib/staging/stagingGate';

/** If something never settles, show the page rather than a blank screen; the server still enforces. */
const REVEAL_FAILSAFE_MS = 15_000;

function subscribeNever() {
  return () => {};
}

function reveal() {
  document.documentElement.removeAttribute(STAGING_GATE_ATTR);
}

function goToProduction() {
  window.location.replace(prodUrlFor(window.location.pathname, window.location.search));
}

/**
 * Staging-only client gate (see src/lib/staging/stagingGate.ts for the rules).
 *
 * Mounted once in Providers. Off the staging hosts it renders nothing and does nothing. On
 * staging, the inline boot script in app/layout.tsx has already hidden the page via
 * `html[data-staging-gate]`; this component removes that once the visitor is allowed, so a
 * visitor who is about to be redirected never sees app content.
 *
 * Firestore is only touched through loadFirestore(), and only on staging for a signed-in
 * non-superadmin, so the SDK stays off the root bundle.
 */
export function StagingGate() {
  // The static export prerenders without a window: the server snapshot is "not staging".
  const onStaging = useSyncExternalStore(
    subscribeNever,
    () => isStagingHost(window.location.hostname),
    () => false
  );
  return onStaging ? <StagingGateEnforcer /> : null;
}

function StagingGateEnforcer() {
  const pathname = usePathname() ?? '/';
  const { firebaseUser, role, authReady, logout } = useAuthStore(
    useShallow((s) => ({
      firebaseUser: s.firebaseUser,
      role: s.user?.role,
      authReady: s.isInitialized && !s.isLoading,
      logout: s.logout,
    }))
  );
  const uid = firebaseUser?.uid ?? null;
  const email = firebaseUser?.email?.toLowerCase() ?? null;

  // Allowlist verdict for the current account, keyed so a different sign-in re-checks.
  const [verdict, setVerdict] = useState<{ key: string; allowed: boolean } | null>(null);
  const key = uid ? `${uid}|${email ?? ''}|${role ?? ''}` : null;
  const acting = useRef(false);

  useEffect(() => {
    const t = setTimeout(reveal, REVEAL_FAILSAFE_MS);
    return () => clearTimeout(t);
  }, []);

  // Decidable without a lookup: superadmins always pass; an account with no email never can.
  const syncAllowed = role === 'superadmin' ? true : uid && !email ? false : undefined;
  const needsLookup = !!key && authReady && syncAllowed === undefined && verdict?.key !== key;

  useEffect(() => {
    if (!needsLookup || !key || !email) return;
    let cancelled = false;
    loadFirestore()
      .then(({ db, doc, getDoc }) => getDoc(doc(db, STAGING_ALLOWLIST_COLLECTION, email)))
      .then((snap) => {
        if (!cancelled) setVerdict({ key, allowed: snap.exists() });
      })
      .catch((err) => {
        // Fail open: a network blip or a rules deploy lag must not sign allowed people out.
        // The blocking functions already refuse sign-in to anyone not allowlisted.
        console.warn('[StagingGate] allowlist lookup failed; not gating', err);
        if (!cancelled) setVerdict({ key, allowed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [needsLookup, key, email]);

  const decision = decideStagingGate({
    pathname,
    authReady,
    signedIn: !!uid,
    allowed: syncAllowed ?? (verdict && verdict.key === key ? verdict.allowed : undefined),
  });

  useEffect(() => {
    if (acting.current) return;
    if (decision === 'allow') {
      reveal();
    } else if (decision === 'redirect') {
      acting.current = true;
      goToProduction();
    } else if (decision === 'signout-redirect') {
      acting.current = true;
      void logout()
        .catch(() => {})
        .finally(goToProduction);
    }
  }, [decision, logout]);

  return null;
}
