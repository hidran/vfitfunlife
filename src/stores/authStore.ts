import { create } from 'zustand';
import { User as FirebaseUser, onAuthStateChanged, setPersistence, indexedDBLocalPersistence } from 'firebase/auth';
import { User } from '@/types/firebase';
import { auth } from '@/lib/firebase/config';
import {
  signInWithGoogle,
  signInWithApple,
  sendOtp,
  verifyOtp,
  signOut as firebaseSignOut,
  getUserData,
  isProfileComplete,
  initRecaptcha,
  handleAuthRedirect,
  registerWithEmail,
  signInWithEmail,
  resetPassword,
  sendVerificationEmail,
  syncEmailVerification,
} from '@/lib/firebase/auth';
import { needsVerificationSync } from '@/lib/emailVerification';
import { RecaptchaVerifier } from 'firebase/auth';
import { isNativePlatform } from '@/lib/capacitor';
import type { AppLocale } from '@/types/locale';

/** Optional profile fields collected on the email registration form. */
export interface RegistrationProfile {
  dateOfBirth?: Date;
  preferredSection?: 'fit' | 'fun' | 'life';
}

interface AuthState {
  // Auth state
  firebaseUser: FirebaseUser | null;
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Phone auth
  recaptchaVerifier: RecaptchaVerifier | null;
  isOtpSent: boolean;
  phoneNumber: string | null;

  // Actions
  initialize: () => () => void;
  loginWithGoogle: () => Promise<void>;
  loginWithApple: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (
    email: string,
    password: string,
    fullName: string,
    preferredLanguage?: AppLocale,
    profile?: RegistrationProfile
  ) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  initPhoneAuth: (buttonId: string) => void;
  sendPhoneOtp: (phoneNumber: string) => Promise<boolean>;
  verifyPhoneOtp: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  setUser: (user: User | null) => void;
  loadUserData: (uid: string) => Promise<User | null>;
  refreshUserProfile: () => Promise<void>;
  /** Re-send the verification email to the signed-in email/password user. */
  resendVerificationEmail: () => Promise<void>;
  /**
   * Reload the Auth user and bring users/{uid}.emailVerified in line with it
   * (auto-verifying Google/Apple sign-ins). Resolves to the verified state.
   */
  checkEmailVerification: () => Promise<boolean>;
}

// Track if we've already handled the redirect in this session
let redirectHandled = false;

// Track the last processed URL to handle HMR and redirects
let lastProcessedUrl: string | null = null;

// Users whose verification state was already synced automatically this session,
// so a sign-in the server refuses to verify isn't re-synced on every profile load.
const verificationAutoSynced = new Set<string>();

function phoneAuthErrorKey(error: unknown, fallback: string): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code
    : null;

  switch (code) {
    case 'auth/invalid-phone-number':
      return 'auth.login.phone.error.invalidPhone';
    case 'auth/captcha-check-failed':
      return 'auth.login.phone.error.captchaFailed';
    case 'auth/too-many-requests':
      return 'auth.login.phone.error.tooManyRequests';
    case 'auth/code-expired':
    case 'auth/invalid-verification-id':
    case 'auth/session-expired':
      return 'auth.login.phone.error.expiredCode';
    case 'auth/invalid-verification-code':
    case 'auth/missing-verification-code':
      return 'auth.login.phone.error.invalidCode';
    default:
      return fallback;
  }
}


export const useAuthStore = create<AuthState>((set, get) => ({
  // Initial state
  firebaseUser: null,
  user: null,
  isLoading: true, // Start loading until initialized
  isInitialized: false,
  error: null,
  recaptchaVerifier: null,
  isOtpSent: false,
  phoneNumber: null,

  // Initialize auth - call this once on app mount
  initialize: () => {
    console.log('[Auth] Initializing auth store...');
    // Cancellation flag to prevent state updates after unmount
    let isCancelled = false;
    // Track if redirect was processed to prevent duplicate handling
    let redirectProcessing = false;
    // Track if auth state has been received
    let authStateReceived = false;

    // Set auth persistence (especially important for native apps)
    const setupPersistence = async () => {
      try {
        // For native apps, ensure we use the correct persistence
        if (isNativePlatform()) {
          console.log('[Auth] Setting up native auth persistence...');
          await setPersistence(auth, indexedDBLocalPersistence);
          console.log('[Auth] Auth persistence set to indexedDB');
        }
      } catch (error) {
        console.warn('[Auth] Failed to set persistence:', error);
      }
    };

    // Handle redirect result first (for Google/Apple sign-in on web)
    const handleRedirect = async () => {
      const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
      console.log('[Auth] Checking redirect... URL:', currentUrl);
      
      // Skip if already processed this URL (HMR protection)
      if (lastProcessedUrl === currentUrl) {
        console.log('[Auth] URL already processed, skipping');
        return;
      }
      
      if (redirectHandled || isCancelled || redirectProcessing) {
        console.log('[Auth] Redirect already handled or processing, skipping');
        return;
      }
      
      // Only check redirect result if we're on an auth page
      const isAuthPage = typeof window !== 'undefined' && 
        (window.location.pathname.startsWith('/auth/') || window.location.pathname === '/');
      
      if (!isAuthPage) {
        console.log('[Auth] Not on auth page, skipping redirect check');
        redirectHandled = true;
        return;
      }

      // Only set redirectProcessing if we're actually going to check for a redirect
      // This prevents blocking onAuthStateChanged when there's no redirect to process
      redirectProcessing = true;
      lastProcessedUrl = currentUrl;

      try {
        console.log('[Auth] Calling handleAuthRedirect...');
        const redirectUser = await handleAuthRedirect();
        console.log('[Auth] Redirect result:', redirectUser ? 'User found' : 'No user');
        if (isCancelled) return;
        
        if (redirectUser) {
          // Redirect auth successful - set user and let onAuthStateChanged confirm
          console.log('[Auth] Setting firebaseUser from redirect, uid:', redirectUser.uid);
          set({ firebaseUser: redirectUser, isLoading: true });
          // Note: onAuthStateChanged will also fire, but loadUserData has UID check
        }
        // If no redirect user, onAuthStateChanged will handle the already-logged-in user
      } catch (error: any) {
        if (isCancelled) return;
        console.error("[Auth] Error handling auth redirect:", error);
        if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
          set({ error: error.message || "Failed to complete sign-in", isLoading: false, isInitialized: true });
        }
      } finally {
        redirectHandled = true;
        redirectProcessing = false;
        console.log('[Auth] Redirect handling complete, redirectProcessing = false');
      }
    };

    // Setup persistence first
    setupPersistence();

    // For native apps, check currentUser immediately as onAuthStateChanged can be delayed
    if (isNativePlatform() && auth.currentUser) {
      console.log('[Auth] Native app: currentUser found immediately:', auth.currentUser.uid);
      authStateReceived = true;
      set({ firebaseUser: auth.currentUser, isLoading: true });
      // Use setTimeout to not block the initialization
      setTimeout(() => {
        if (!isCancelled) {
          get().loadUserData(auth.currentUser!.uid);
        }
      }, 0);
    }

    // Subscribe to auth state changes
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      authStateReceived = true;
      console.log('[Auth] onAuthStateChanged fired, user:', firebaseUser ? firebaseUser.uid : 'null');
      if (isCancelled) return;
      
      // Note: We don't skip when redirectProcessing is true because:
      // 1. The redirect check might complete before onAuthStateChanged fires
      // 2. If no redirect user is found, onAuthStateChanged needs to handle the persistent auth user
      // 3. loadUserData has duplicate loading checks to prevent issues
      
      if (firebaseUser) {
        // Avoid duplicate load if redirect already handled this user
        const currentState = get();
        console.log('[Auth] Current state - firebaseUser:', currentState.firebaseUser?.uid, 'user:', currentState.user?.uid);
        if (currentState.firebaseUser?.uid === firebaseUser.uid && currentState.user) {
          console.log('[Auth] User already loaded, skipping');
          return;
        }
        console.log('[Auth] Setting firebaseUser and loading data...');
        set({ firebaseUser, isLoading: true });
        await get().loadUserData(firebaseUser.uid);
      } else {
        console.log('[Auth] No user, setting null state');
        set({
          firebaseUser: null,
          user: null,
          isLoading: false,
          isInitialized: true,
        });
      }
    });

    // Start redirect handling (don't await, let it run in parallel with auth listener)
    handleRedirect();

    // Set a timeout to ensure auth eventually completes (especially for native apps)
    // Sometimes onAuthStateChanged can take a while or not fire properly
    const timeoutId = setTimeout(() => {
      if (isCancelled) return;
      // Watchdog: if we're still loading after the timeout — whether because
      // onAuthStateChanged never fired OR loadUserData/a cold-start Cloud
      // Function is stuck — force-resolve so the UI can never hang on a spinner.
      const currentState = get();
      if (currentState.isLoading) {
        console.warn('[Auth] Auth watchdog fired - forcing loading to resolve');
        set({ isLoading: false, isInitialized: true });
      }
    }, 8000);

    // Return cleanup function
    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
      unsubscribe();
    };
  },

  // Load user data from Firestore with retry for new users
  loadUserData: async (uid: string) => {
    console.log('[Auth] Loading user data for uid:', uid);
    try {
      let userData = await getUserData(uid);
      console.log('[Auth] User data from Firestore:', userData ? 'found' : 'not found');

      // No user document means the Auth account still needs the registration form. Do not
      // auto-create a blank profile here: that skips the provider opt-in/category step for
      // phone and social signups.

      // A freshly-written profile (just-registered user) may not be readable
      // immediately. Retry with short backoff, re-reading each time, so we
      // proceed the moment it's ready instead of waiting a fixed ~3s.
      if (!userData) {
        const backoffsMs = [300, 600, 1000];
        for (let i = 0; i < backoffsMs.length && !userData; i++) {
          await new Promise((resolve) => setTimeout(resolve, backoffsMs[i]));
          userData = await getUserData(uid);
        }
      }

      // Verify the Firebase user hasn't changed (prevent race condition)
      const currentFirebaseUser = get().firebaseUser;
      console.log('[Auth] Current firebase user:', currentFirebaseUser?.uid, 'requested uid:', uid);
      if (!userData || currentFirebaseUser?.uid !== uid) {
        // User document doesn't exist or auth state changed - need to complete registration
        console.log('[Auth] User data not found or auth changed, setting null user');
        set({ user: null, isLoading: false, isInitialized: true });
        return null;
      }

      const user = { ...userData, id: uid, uid } as User;
      console.log('[Auth] User data loaded successfully');
      set({
        user,
        isLoading: false,
        isInitialized: true,
      });

      // Google/Apple sign-ins, and email accounts verified since the last load,
      // get users/{uid}.emailVerified set server-side. Fire and forget.
      if (
        currentFirebaseUser.email &&
        !verificationAutoSynced.has(uid) &&
        needsVerificationSync(
          { ...currentFirebaseUser, providerData: currentFirebaseUser.providerData ?? [] },
          user.emailVerified,
        )
      ) {
        verificationAutoSynced.add(uid);
        get().checkEmailVerification().catch((err) => {
          console.warn('[Auth] Email verification sync failed:', err);
        });
      }
      return user;
    } catch (error) {
      console.error('[Auth] Error loading user data:', error);
      set({
        error: 'Failed to load user data',
        isLoading: false,
        isInitialized: true
      });
      return null;
    }
  },

  // Refresh user profile
  refreshUserProfile: async () => {
    const { firebaseUser } = get();
    if (firebaseUser) {
      await get().loadUserData(firebaseUser.uid);
    }
  },

  // Google Sign In
  loginWithGoogle: async () => {
    console.log('[AuthStore] loginWithGoogle starting');
    set({ isLoading: true, error: null });
    try {
      console.log('[AuthStore] Calling signInWithGoogle...');
      const firebaseUser = await signInWithGoogle();
      console.log('[AuthStore] signInWithGoogle returned:', firebaseUser ? 'user' : 'null');

      // If null, redirect flow is being used - page will reload
      if (!firebaseUser) {
        console.log('[AuthStore] No firebaseUser, returning (redirect flow)');
        // Keep loading state - redirect will handle the rest
        return;
      }

      // For popup flow (native), handle immediately
      console.log('[AuthStore] Setting firebaseUser, uid:', firebaseUser.uid);
      set({ firebaseUser, isLoading: true });

      // Check if profile is complete
      console.log('[AuthStore] Checking profile complete...');
      const profileComplete = await isProfileComplete(firebaseUser.uid);
      console.log('[AuthStore] Profile complete:', profileComplete);

      if (profileComplete) {
        console.log('[AuthStore] Profile complete, loading user data...');
        await get().loadUserData(firebaseUser.uid);
      } else {
        // Profile incomplete - redirect to registration will be handled by component
        console.log('[AuthStore] Profile incomplete, setting state');
        set({ isLoading: false, isInitialized: true });
      }
    } catch (error: any) {
      console.error('[AuthStore] Google sign in error:', error);
      set({
        error: error.message || 'Failed to sign in with Google',
        isLoading: false
      });
    }
  },

  // Apple Sign In
  loginWithApple: async () => {
    set({ isLoading: true, error: null });
    try {
      const firebaseUser = await signInWithApple();

      // If null, redirect flow is being used - page will reload
      if (!firebaseUser) {
        // Keep loading state - redirect will handle the rest
        return;
      }

      // For popup flow (native), handle immediately
      set({ firebaseUser, isLoading: true });

      // Check if profile is complete
      const profileComplete = await isProfileComplete(firebaseUser.uid);

      if (profileComplete) {
        await get().loadUserData(firebaseUser.uid);
      } else {
        // Profile incomplete - redirect to registration will be handled by component
        set({ isLoading: false, isInitialized: true });
      }
    } catch (error: any) {
      console.error('Apple sign in error:', error);
      set({
        error: error.message || 'Failed to sign in with Apple',
        isLoading: false
      });
    }
  },

  // Initialize reCAPTCHA for phone auth
  initPhoneAuth: (buttonId: string) => {
    try {
      const verifier = initRecaptcha(buttonId);
      set({ recaptchaVerifier: verifier, error: null });
    } catch (error: any) {
      console.error('ReCAPTCHA initialization error:', error);
      set({ error: 'Failed to initialize phone authentication' });
    }
  },

  // Send OTP to phone number
  sendPhoneOtp: async (phoneNumber: string) => {
    const { recaptchaVerifier } = get();

    // Native uses the plugin's native verification — no reCAPTCHA needed.
    if (!isNativePlatform() && !recaptchaVerifier) {
      set({ error: 'Phone authentication not initialized' });
      return false;
    }

    set({ isLoading: true, error: null, phoneNumber });

    try {
      await sendOtp(phoneNumber, recaptchaVerifier ?? undefined);
      set({ isOtpSent: true, isLoading: false });
      return true;
    } catch (error: any) {
      console.error('Send OTP error:', error);
      set({
        error: phoneAuthErrorKey(error, 'auth.login.phone.error.sendCode'),
        isLoading: false,
        isOtpSent: false
      });
      return false;
    }
  },

  // Verify OTP code
  verifyPhoneOtp: async (code: string) => {
    set({ isLoading: true, error: null });

    try {
      const firebaseUser = await verifyOtp(code);
      set({ firebaseUser, isLoading: true, isOtpSent: false, phoneNumber: null });

      // Check if profile is complete
      const profileComplete = await isProfileComplete(firebaseUser.uid);

      if (profileComplete) {
        await get().loadUserData(firebaseUser.uid);
      } else {
        // Profile incomplete - redirect to registration will be handled by component
        set({ isLoading: false, isInitialized: true });
      }
    } catch (error: any) {
      console.error('Verify OTP error:', error);
      set({
        error: phoneAuthErrorKey(error, 'auth.login.phone.error.generic'),
        isLoading: false
      });
    }
  },

  // Logout
  logout: async () => {
    set({ isLoading: true, error: null });
    try {
      await firebaseSignOut();
      set({
        firebaseUser: null,
        user: null,
        isLoading: false,
        isOtpSent: false,
        phoneNumber: null,
        recaptchaVerifier: null
      });
    } catch (error: any) {
      console.error('Logout error:', error);
      set({ error: error.message || 'Failed to logout', isLoading: false });
    }
  },

  // Clear error
  clearError: () => set({ error: null }),

  // Email/Password Login
  loginWithEmail: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const firebaseUser = await signInWithEmail(email, password);
      set({ firebaseUser, isLoading: true });

      // Check if profile is complete
      const profileComplete = await isProfileComplete(firebaseUser.uid);

      if (profileComplete) {
        await get().loadUserData(firebaseUser.uid);
      } else {
        // Profile incomplete - redirect to registration will be handled by component
        set({ isLoading: false, isInitialized: true });
      }
    } catch (error: any) {
      console.error('Email sign in error:', error);
      let errorMessage = 'Failed to sign in';
      
      // Map Firebase error codes to user-friendly messages
      switch (error.code) {
        case 'auth/user-not-found':
          errorMessage = 'No account found with this email';
          break;
        case 'auth/wrong-password':
          errorMessage = 'Incorrect password';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Invalid email address';
          break;
        case 'auth/user-disabled':
          errorMessage = 'This account has been disabled';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Too many failed attempts. Please try again later';
          break;
        case 'auth/operation-not-allowed':
          errorMessage = 'Email/Password authentication is not enabled. Please contact support or use Google/Apple sign-in.';
          console.error('[Firebase] Email/Password auth not enabled in Firebase Console. See docs/backend/firebase-auth-setup.md');
          break;
        default:
          errorMessage = error.message || 'Failed to sign in';
      }
      
      set({
        error: errorMessage,
        isLoading: false
      });
    }
  },

  // Email/Password Registration
  registerWithEmail: async (email, password, fullName, preferredLanguage, profile) => {
    set({ isLoading: true, error: null });
    try {
      const firebaseUser = await registerWithEmail(email, password);

      // Create user profile in Firestore
      const { completeRegistration } = await import('@/lib/firebase/auth');
      await completeRegistration(firebaseUser.uid, {
        fullName,
        email,
        dateOfBirth: profile?.dateOfBirth,
        preferredSection: profile?.preferredSection ?? 'fit',
        preferredLanguage,
      });

      // Publish the auth user only after the profile exists. The registration
      // page immediately navigates to permissions, so load the profile before
      // /home's protected layout can see firebaseUser without user.
      set({ firebaseUser, isLoading: true });
      const user = await get().loadUserData(firebaseUser.uid);
      if (!user) {
        throw new Error('Registration profile could not be loaded');
      }

      // The account exists at this point, so a failed send must not fail the
      // registration; the verification banner offers a resend.
      try {
        await sendVerificationEmail(firebaseUser, preferredLanguage);
      } catch (sendError) {
        console.warn('[Auth] Verification email not sent:', sendError);
      }
    } catch (error: any) {
      console.error('Email registration error:', error);
      let errorMessage = 'Failed to create account';
      
      // Map Firebase error codes to user-friendly messages
      switch (error.code) {
        case 'auth/email-already-in-use':
          errorMessage = 'An account with this email already exists';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Invalid email address';
          break;
        case 'auth/weak-password':
          errorMessage = 'Password is too weak. Use at least 6 characters';
          break;
        case 'auth/operation-not-allowed':
          errorMessage = 'Email/Password authentication is not enabled. Please contact support or use Google/Apple sign-in.';
          console.error('[Firebase] Email/Password auth not enabled in Firebase Console. See docs/backend/firebase-auth-setup.md');
          break;
        default:
          errorMessage = error.message || 'Failed to create account';
      }
      
      set({
        error: errorMessage,
        isLoading: false
      });
      // The registration page must not navigate as if signup succeeded when
      // profile creation failed after Firebase Auth succeeded.
      throw error;
    }
  },

  // Password Reset
  resetPassword: async (email: string) => {
    set({ isLoading: true, error: null });
    try {
      await resetPassword(email);
      set({ isLoading: false });
    } catch (error: any) {
      console.error('Password reset error:', error);
      let errorMessage = 'Failed to send reset email';
      
      switch (error.code) {
        case 'auth/user-not-found':
          errorMessage = 'No account found with this email';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Invalid email address';
          break;
        default:
          errorMessage = error.message || 'Failed to send reset email';
      }
      
      set({
        error: errorMessage,
        isLoading: false
      });
    }
  },

  // Set user manually (for registration flow)
  setUser: (user: User | null) => set({ user }),

  resendVerificationEmail: async () => {
    const current = auth.currentUser;
    if (!current) throw new Error('Not signed in');
    await sendVerificationEmail(current, get().user?.preferredLanguage);
  },

  checkEmailVerification: async () => {
    const current = auth.currentUser;
    const { user } = get();
    if (!current || !user) return false;

    // Pick up a verification link opened in another tab or the mail app.
    await current.reload();
    if (!needsVerificationSync(current, user.emailVerified)) {
      return current.emailVerified || user.emailVerified === true;
    }

    const { emailVerified } = await syncEmailVerification();
    if (emailVerified) {
      // The server may have just set emailVerified on the Auth record
      // (Google/Apple); reload so the SDK user and its token reflect it.
      await current.reload();
      set((state) => ({
        firebaseUser: current,
        user: state.user ? { ...state.user, emailVerified: true } : state.user,
      }));
    }
    return emailVerified;
  },
}));
