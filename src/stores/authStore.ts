import { create } from 'zustand';
import { User as FirebaseUser, onAuthStateChanged } from 'firebase/auth';
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
} from '@/lib/firebase/auth';
import { RecaptchaVerifier } from 'firebase/auth';

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
  initPhoneAuth: (buttonId: string) => void;
  sendPhoneOtp: (phoneNumber: string) => Promise<boolean>;
  verifyPhoneOtp: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  setUser: (user: User | null) => void;
  loadUserData: (uid: string) => Promise<User | null>;
  refreshUserProfile: () => Promise<void>;
}

// Track if we've already handled the redirect in this session
let redirectHandled = false;

// Track the last processed URL to handle HMR and redirects
let lastProcessedUrl: string | null = null;

// Constants for retry logic
const RETRY_DELAY_MS = 1000;
const MAX_RETRIES = 3;

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
    // Cancellation flag to prevent state updates after unmount
    let isCancelled = false;
    // Track if redirect was processed to prevent duplicate handling
    let redirectProcessing = false;

    // Handle redirect result first (for Google/Apple sign-in on web)
    const handleRedirect = async () => {
      const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
      
      // Skip if already processed this URL (HMR protection)
      if (lastProcessedUrl === currentUrl) {
        return;
      }
      
      if (redirectHandled || isCancelled || redirectProcessing) return;
      
      // Only check redirect result if we're on an auth page
      const isAuthPage = typeof window !== 'undefined' && 
        (window.location.pathname.startsWith('/auth/') || window.location.pathname === '/');
      
      if (!isAuthPage) {
        redirectHandled = true;
        return;
      }

      redirectProcessing = true;
      lastProcessedUrl = currentUrl;

      try {
        const redirectUser = await handleAuthRedirect();
        if (isCancelled) return;
        
        if (redirectUser) {
          // Redirect auth successful - set user and let onAuthStateChanged confirm
          set({ firebaseUser: redirectUser, isLoading: true });
          // Note: onAuthStateChanged will also fire, but loadUserData has UID check
        }
      } catch (error: any) {
        if (isCancelled) return;
        console.error("Error handling auth redirect:", error);
        if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
          set({ error: error.message || "Failed to complete sign-in", isLoading: false, isInitialized: true });
        }
      } finally {
        redirectHandled = true;
        redirectProcessing = false;
      }
    };

    // Subscribe to auth state changes
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (isCancelled) return;
      
      // If we're processing a redirect, wait for it unless this is a null (logout)
      if (redirectProcessing && firebaseUser) {
        // Redirect processing will handle this
        return;
      }
      
      if (firebaseUser) {
        // Avoid duplicate load if redirect already handled this user
        const currentState = get();
        if (currentState.firebaseUser?.uid === firebaseUser.uid && currentState.user) {
          return;
        }
        set({ firebaseUser, isLoading: true });
        await get().loadUserData(firebaseUser.uid);
      } else {
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

    // Return cleanup function
    return () => {
      isCancelled = true;
      unsubscribe();
    };
  },

  // Load user data from Firestore with retry for new users
  loadUserData: async (uid: string) => {
    try {
      let userData = await getUserData(uid);

      // For new users, the Cloud Function might not have created the document yet
      // Retry a few times with delay
      if (!userData) {
        for (let i = 0; i < MAX_RETRIES; i++) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          userData = await getUserData(uid);
          if (userData) break;
        }
      }

      // Verify the Firebase user hasn't changed (prevent race condition)
      const currentFirebaseUser = get().firebaseUser;
      if (!userData || currentFirebaseUser?.uid !== uid) {
        // User document doesn't exist or auth state changed - need to complete registration
        set({ user: null, isLoading: false, isInitialized: true });
        return null;
      }

      const user = { ...userData, id: uid, uid } as User;
      set({
        user,
        isLoading: false,
        isInitialized: true,
      });
      return user;
    } catch (error) {
      console.error('Error loading user data:', error);
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
    set({ isLoading: true, error: null });
    try {
      const firebaseUser = await signInWithGoogle();

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
      console.error('Google sign in error:', error);
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

    if (!recaptchaVerifier) {
      set({ error: 'Phone authentication not initialized' });
      return false;
    }

    set({ isLoading: true, error: null, phoneNumber });

    try {
      await sendOtp(phoneNumber, recaptchaVerifier);
      set({ isOtpSent: true, isLoading: false });
      return true;
    } catch (error: any) {
      console.error('Send OTP error:', error);
      set({
        error: error.message || 'Failed to send verification code',
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
        error: error.message || 'Invalid verification code',
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

  // Set user manually (for registration flow)
  setUser: (user: User | null) => set({ user }),
}));
