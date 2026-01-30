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
    // Handle redirect result first (for Google/Apple sign-in on web)
    const handleRedirect = async () => {
      if (redirectHandled) return;
      redirectHandled = true;

      try {
        const redirectUser = await handleAuthRedirect();
        if (redirectUser) {
          set({ firebaseUser: redirectUser, isLoading: true });
          await get().loadUserData(redirectUser.uid);
        }
      } catch (error) {
        console.error("Error handling auth redirect:", error);
        set({ error: "Failed to complete sign-in", isLoading: false, isInitialized: true });
      }
    };

    handleRedirect();

    // Subscribe to auth state changes
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
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

    return unsubscribe;
  },

  // Load user data from Firestore with retry for new users
  loadUserData: async (uid: string) => {
    try {
      let userData = await getUserData(uid);

      // For new users, the Cloud Function might not have created the document yet
      // Retry a few times with delay
      if (!userData) {
        for (let i = 0; i < 3; i++) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
          userData = await getUserData(uid);
          if (userData) break;
        }
      }

      if (userData) {
        const user = { ...userData, id: uid, uid } as User;
        set({
          user,
          isLoading: false,
          isInitialized: true,
        });
        return user;
      } else {
        // User document doesn't exist - need to complete registration
        set({ user: null, isLoading: false, isInitialized: true });
        return null;
      }
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
