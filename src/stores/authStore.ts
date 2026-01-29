import { create } from 'zustand';
import { User as FirebaseUser } from 'firebase/auth';
import { User } from '@/types/firebase';
import {
  signInWithGoogle,
  signInWithApple,
  sendOtp,
  verifyOtp,
  signOut as firebaseSignOut,
  onAuthChange,
  getUserData,
  isProfileComplete,
  initRecaptcha,
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
  initAuth: () => void;
  loginWithGoogle: () => Promise<void>;
  loginWithApple: () => Promise<void>;
  initPhoneAuth: (buttonId: string) => void;
  sendPhoneOtp: (phoneNumber: string) => Promise<void>;
  verifyPhoneOtp: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  setUser: (user: User | null) => void;
  loadUserData: (uid: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // Initial state
  firebaseUser: null,
  user: null,
  isLoading: false,
  isInitialized: false,
  error: null,
  recaptchaVerifier: null,
  isOtpSent: false,
  phoneNumber: null,

  // Initialize auth listener
  initAuth: () => {
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      set({ firebaseUser, isLoading: true });

      if (firebaseUser) {
        // Load user data from Firestore
        await get().loadUserData(firebaseUser.uid);
      } else {
        set({ user: null, isLoading: false, isInitialized: true });
      }
    });

    // Store cleanup function
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', unsubscribe);
    }
  },

  // Load user data from Firestore
  loadUserData: async (uid: string) => {
    try {
      const userData = await getUserData(uid);

      if (userData) {
        set({
          user: { ...userData, id: uid, uid } as User,
          isLoading: false,
          isInitialized: true,
        });
      } else {
        // User document doesn't exist, need to complete registration
        set({ user: null, isLoading: false, isInitialized: true });
      }
    } catch (error) {
      console.error('Error loading user data:', error);
      set({
        error: 'Failed to load user data',
        isLoading: false,
        isInitialized: true
      });
    }
  },

  // Google Sign In
  loginWithGoogle: async () => {
    set({ isLoading: true, error: null });
    try {
      const firebaseUser = await signInWithGoogle();

      // Check if profile is complete
      const profileComplete = await isProfileComplete(firebaseUser.uid);

      if (!profileComplete) {
        // Redirect to complete registration will be handled by the component
        set({ isLoading: false });
      } else {
        await get().loadUserData(firebaseUser.uid);
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

      // Check if profile is complete
      const profileComplete = await isProfileComplete(firebaseUser.uid);

      if (!profileComplete) {
        // Redirect to complete registration will be handled by the component
        set({ isLoading: false });
      } else {
        await get().loadUserData(firebaseUser.uid);
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
      return;
    }

    set({ isLoading: true, error: null, phoneNumber });

    try {
      await sendOtp(phoneNumber, recaptchaVerifier);
      set({ isOtpSent: true, isLoading: false });
    } catch (error: any) {
      console.error('Send OTP error:', error);
      set({
        error: error.message || 'Failed to send verification code',
        isLoading: false,
        isOtpSent: false
      });
    }
  },

  // Verify OTP code
  verifyPhoneOtp: async (code: string) => {
    set({ isLoading: true, error: null });

    try {
      const firebaseUser = await verifyOtp(code);

      // Check if profile is complete
      const profileComplete = await isProfileComplete(firebaseUser.uid);

      if (!profileComplete) {
        // Redirect to complete registration will be handled by the component
        set({ isLoading: false, isOtpSent: false, phoneNumber: null });
      } else {
        await get().loadUserData(firebaseUser.uid);
        set({ isOtpSent: false, phoneNumber: null });
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
