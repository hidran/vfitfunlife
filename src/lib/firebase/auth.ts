import {
  signInWithPhoneNumber,
  PhoneAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  OAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
  RecaptchaVerifier,
  ConfirmationResult,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./config";

// Store confirmation result for OTP verification
let confirmationResult: ConfirmationResult | null = null;

/**
 * Initialize reCAPTCHA verifier for phone auth
 */
export function initRecaptcha(containerId: string): RecaptchaVerifier {
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`reCAPTCHA container with id '${containerId}' not found`);
  }

  return new RecaptchaVerifier(auth, containerId, {
    size: "invisible",
    callback: () => {
      // reCAPTCHA solved
      console.log('[reCAPTCHA] Solved');
    },
    "expired-callback": () => {
      // Reset reCAPTCHA
      console.log('[reCAPTCHA] Expired, resetting...');
    },
  });
}

/**
 * Send OTP to phone number
 */
export async function sendOtp(
  phoneNumber: string,
  recaptchaVerifier: RecaptchaVerifier
): Promise<void> {
  // Format phone number with Italian country code if not present
  const formattedPhone = phoneNumber.startsWith("+")
    ? phoneNumber
    : `+39${phoneNumber.replace(/^0/, "")}`;

  confirmationResult = await signInWithPhoneNumber(auth, formattedPhone, recaptchaVerifier);
}

/**
 * Verify OTP code
 */
export async function verifyOtp(code: string): Promise<User> {
  if (!confirmationResult) {
    throw new Error("No confirmation result. Please request OTP first.");
  }

  const result = await confirmationResult.confirm(code);
  confirmationResult = null;

  // Update last login
  await updateUserLastLogin(result.user.uid);

  return result.user;
}

/**
 * Sign in with Google
 * Uses redirect flow on web (avoids COOP issues) and popup on native
 */
export async function signInWithGoogle(): Promise<User | null> {
  const provider = new GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");

  // On native platforms, use popup (works better with Capacitor)
  if (Capacitor.isNativePlatform()) {
    const result = await signInWithPopup(auth, provider);
    await updateUserLastLogin(result.user.uid);
    return result.user;
  }

  // On web, use redirect to avoid COOP issues
  await signInWithRedirect(auth, provider);
  return null; // Redirect will reload the page
}

/**
 * Handle redirect result after Google/Apple sign-in redirect
 * Call this on app initialization
 */
export async function handleAuthRedirect(): Promise<User | null> {
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      await updateUserLastLogin(result.user.uid);
      return result.user;
    }
    return null;
  } catch (error) {
    console.error("Error handling auth redirect:", error);
    throw error;
  }
}

/**
 * Sign in with Apple
 * Uses redirect flow on web (avoids COOP issues) and popup on native
 */
export async function signInWithApple(): Promise<User | null> {
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");

  // On native platforms, use popup (works better with Capacitor)
  if (Capacitor.isNativePlatform()) {
    const result = await signInWithPopup(auth, provider);
    await updateUserLastLogin(result.user.uid);
    return result.user;
  }

  // On web, use redirect to avoid COOP issues
  await signInWithRedirect(auth, provider);
  return null; // Redirect will reload the page
}

/**
 * Sign out
 */
export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

/**
 * Get current user
 */
export function getCurrentUser(): User | null {
  return auth.currentUser;
}

/**
 * Subscribe to auth state changes
 */
export function onAuthChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

/**
 * Check if user profile is complete
 */
export async function isProfileComplete(userId: string): Promise<boolean> {
  try {
    const userDoc = await getDoc(doc(db, "users", userId));

    if (!userDoc.exists()) {
      return false;
    }

    const data = userDoc.data();
    return Boolean(data.fullName && data.fullName.trim().length > 0);
  } catch (error: any) {
    // If offline or network error, assume profile is incomplete to redirect to registration
    if (error.code === 'unavailable' || error.message?.includes('offline')) {
      console.warn('Firestore offline during profile check, assuming incomplete');
      return false;
    }
    throw error;
  }
}

/**
 * Update user's last login timestamp
 */
async function updateUserLastLogin(userId: string): Promise<void> {
  try {
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      await updateDoc(userRef, {
        lastLoginAt: serverTimestamp(),
      });
    }
  } catch (error: any) {
    // Silently fail if offline - this is non-critical
    if (error.code === 'unavailable' || error.message?.includes('offline')) {
      console.warn('Firestore offline, skipping last login update');
      return;
    }
    // Don't throw - last login update shouldn't block authentication
    console.error('Failed to update last login:', error);
  }
}

/**
 * Complete user registration with profile data
 */
export async function completeRegistration(
  userId: string,
  data: {
    fullName: string;
    email?: string;
    dateOfBirth?: Date;
    preferredSection?: "fit" | "fun" | "life";
  }
): Promise<void> {
  const userRef = doc(db, "users", userId);

  await setDoc(userRef, {
    fullName: data.fullName,
    email: data.email || null,
    dateOfBirth: data.dateOfBirth || null,
    preferredSection: data.preferredSection || "fit",
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(), // Add createdAt for new users
  }, { merge: true });
}

/**
 * Get user data from Firestore
 */
export async function getUserData(userId: string) {
  try {
    const userDoc = await getDoc(doc(db, "users", userId));
    return userDoc.exists() ? userDoc.data() : null;
  } catch (error: any) {
    // If offline, return null - the app should handle this gracefully
    if (error.code === 'unavailable' || error.message?.includes('offline')) {
      console.warn('Firestore offline during user data fetch');
      return null;
    }
    throw error;
  }
}

/**
 * Register with email and password
 */
export async function registerWithEmail(
  email: string,
  password: string
): Promise<User> {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  return result.user;
}

/**
 * Sign in with email and password
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

/**
 * Send password reset email
 */
export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

/**
 * Send email verification
 */
export async function verifyEmail(user: User): Promise<void> {
  await sendEmailVerification(user);
}

/**
 * Check if email is verified
 */
export function isEmailVerified(user: User): boolean {
  return user.emailVerified;
}

/**
 * Update user password (requires reauthentication)
 */
export async function changePassword(
  user: User,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  // Reauthenticate user first
  const credential = EmailAuthProvider.credential(
    user.email!,
    currentPassword
  );
  await reauthenticateWithCredential(user, credential);
  
  // Update password
  await updatePassword(user, newPassword);
}

/**
 * Check if user signed in with email/password
 */
export function isEmailProvider(user: User): boolean {
  return user.providerData.some(
    (provider) => provider.providerId === 'password'
  );
}
