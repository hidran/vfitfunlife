import {
  signInWithPhoneNumber,
  PhoneAuthProvider,
  signInWithCredential,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
  RecaptchaVerifier,
  ConfirmationResult,
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./config";

// Store confirmation result for OTP verification
let confirmationResult: ConfirmationResult | null = null;

/**
 * Initialize reCAPTCHA verifier for phone auth
 */
export function initRecaptcha(buttonId: string): RecaptchaVerifier {
  return new RecaptchaVerifier(auth, buttonId, {
    size: "invisible",
    callback: () => {
      // reCAPTCHA solved
    },
    "expired-callback": () => {
      // Reset reCAPTCHA
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
 */
export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");

  const result = await signInWithPopup(auth, provider);
  await updateUserLastLogin(result.user.uid);

  return result.user;
}

/**
 * Sign in with Apple
 */
export async function signInWithApple(): Promise<User> {
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");

  const result = await signInWithPopup(auth, provider);
  await updateUserLastLogin(result.user.uid);

  return result.user;
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
  const userDoc = await getDoc(doc(db, "users", userId));

  if (!userDoc.exists()) {
    return false;
  }

  const data = userDoc.data();
  return Boolean(data.fullName && data.fullName.trim().length > 0);
}

/**
 * Update user's last login timestamp
 */
async function updateUserLastLogin(userId: string): Promise<void> {
  const userRef = doc(db, "users", userId);
  const userDoc = await getDoc(userRef);

  if (userDoc.exists()) {
    await updateDoc(userRef, {
      lastLoginAt: serverTimestamp(),
    });
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

  await updateDoc(userRef, {
    fullName: data.fullName,
    email: data.email || null,
    dateOfBirth: data.dateOfBirth || null,
    preferredSection: data.preferredSection || "fit",
    updatedAt: serverTimestamp(),
  });
}

/**
 * Get user data from Firestore
 */
export async function getUserData(userId: string) {
  const userDoc = await getDoc(doc(db, "users", userId));
  return userDoc.exists() ? userDoc.data() : null;
}
