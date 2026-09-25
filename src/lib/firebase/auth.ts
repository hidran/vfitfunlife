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
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, arrayUnion, arrayRemove } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "./config";
import { nativeGoogleSignIn, nativeAppleSignIn } from "./nativeAuth";
import { ProviderProfile, Certification, Education, SocialLinks, NotificationSettings, PrivacySettings } from "@/types/firebase";
import { DEFAULT_LOCALE, type AppLocale } from "@/types/locale";

// Store confirmation result for OTP verification (web reCAPTCHA flow)
let confirmationResult: ConfirmationResult | null = null;
// Verification id for the native phone-auth flow (no reCAPTCHA on device)
let nativeVerificationId: string | null = null;

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
  recaptchaVerifier?: RecaptchaVerifier
): Promise<void> {
  // Format phone number with Italian country code if not present
  const formattedPhone = phoneNumber.startsWith("+")
    ? phoneNumber
    : `+39${phoneNumber.replace(/^0/, "")}`;

  // On native, use the plugin's native verification (APNs/Play Integrity) — no
  // web reCAPTCHA, which is unreliable in the mobile webview.
  if (Capacitor.isNativePlatform()) {
    const { nativeSendPhoneOtp } = await import("./nativeAuth");
    nativeVerificationId = await nativeSendPhoneOtp(formattedPhone);
    return;
  }

  if (!recaptchaVerifier) {
    throw new Error("reCAPTCHA verifier is required for web phone sign-in");
  }
  confirmationResult = await signInWithPhoneNumber(auth, formattedPhone, recaptchaVerifier);
}

/**
 * Verify OTP code
 */
export async function verifyOtp(code: string): Promise<User> {
  // Native flow: bridge the verificationId + code into the JS SDK.
  if (Capacitor.isNativePlatform()) {
    if (!nativeVerificationId) {
      throw new Error("No verification in progress. Please request a code first.");
    }
    const { nativeVerifyPhoneOtp } = await import("./nativeAuth");
    const user = await nativeVerifyPhoneOtp(auth, nativeVerificationId, code);
    nativeVerificationId = null;
    void updateUserLastLogin(user.uid);
    return user;
  }

  if (!confirmationResult) {
    throw new Error("No confirmation result. Please request OTP first.");
  }

  const result = await confirmationResult.confirm(code);
  confirmationResult = null;

  // Update last login
  void updateUserLastLogin(result.user.uid);

  return result.user;
}

/**
 * Sign in with Google
 * Uses popup on all platforms (redirect has issues with web.app domain)
 */
export async function signInWithGoogle(): Promise<User | null> {
  console.log('[Auth] signInWithGoogle called');
  const provider = new GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");

  if (Capacitor.isNativePlatform()) {
    console.log('[Auth] Using native Google sign-in');
    const user = await nativeGoogleSignIn(auth);
    void updateUserLastLogin(user.uid);
    return user;
  }

  // Use popup for all platforms (redirect has domain issues)
  console.log('[Auth] Using popup flow');
  console.log('[Auth] Current auth domain:', auth.app.options.authDomain);
  try {
    const result = await signInWithPopup(auth, provider);
    console.log('[Auth] Popup success, uid:', result.user.uid);
    void updateUserLastLogin(result.user.uid);
    return result.user;
  } catch (error: any) {
    console.error('[Auth] signInWithPopup failed:', error);
    console.error('[Auth] Error code:', error.code);
    // If popup blocked, fall back to redirect
    if (error.code === 'auth/popup-blocked') {
      console.log('[Auth] Popup blocked, falling back to redirect');
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw error;
  }
}

/**
 * Handle redirect result after Google/Apple sign-in redirect
 * Call this on app initialization
 */
export async function handleAuthRedirect(): Promise<User | null> {
  console.log('[Auth] handleAuthRedirect called');
  try {
    console.log('[Auth] Calling getRedirectResult...');
    const result = await getRedirectResult(auth);
    console.log('[Auth] getRedirectResult result:', result ? 'has result' : 'null');
    if (result?.user) {
      console.log('[Auth] Redirect user found, uid:', result.user.uid);
      void updateUserLastLogin(result.user.uid);
      return result.user;
    }
    console.log('[Auth] No redirect user found');
    return null;
  } catch (error: any) {
    console.error("[Auth] Error handling auth redirect:", error);
    console.error("[Auth] Error code:", error.code);
    console.error("[Auth] Error message:", error.message);
    throw error;
  }
}

/**
 * Sign in with Apple
 * Uses popup on all platforms (redirect has issues with web.app domain)
 */
export async function signInWithApple(): Promise<User | null> {
  console.log('[Auth] signInWithApple called');
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");

  if (Capacitor.isNativePlatform()) {
    console.log('[Auth] Using native Apple sign-in');
    const user = await nativeAppleSignIn(auth);
    void updateUserLastLogin(user.uid);
    return user;
  }

  // Use popup for all platforms
  console.log('[Auth] Using popup flow for Apple');
  try {
    const result = await signInWithPopup(auth, provider);
    console.log('[Auth] Apple popup success, uid:', result.user.uid);
    void updateUserLastLogin(result.user.uid);
    return result.user;
  } catch (error: any) {
    console.error('[Auth] signInWithPopup (Apple) failed:', error);
    console.error('[Auth] Error code:', error.code);
    // If popup blocked, fall back to redirect
    if (error.code === 'auth/popup-blocked') {
      console.log('[Auth] Popup blocked, falling back to redirect');
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw error;
  }
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
 * Also tries to initialize profile if document doesn't exist
 */
export async function isProfileComplete(userId: string): Promise<boolean> {
  try {
    const userDoc = await getDoc(doc(db, "users", userId));

    if (!userDoc.exists()) {
      // A Firebase Auth account without a Firestore profile must complete registration.
      // Auto-initializing here would skip the provider opt-in/category picker on phone and
      // social signups.
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
    preferredLanguage?: AppLocale;
  }
): Promise<void> {
  const userRef = doc(db, "users", userId);
  const userDoc = await getDoc(userRef);
  const authPhone = auth.currentUser?.uid === userId ? auth.currentUser.phoneNumber : null;

  if (!userDoc.exists()) {
    // New user, create document with all required fields to satisfy isValidUserCreate
    await setDoc(userRef, {
      uid: userId,
      fullName: data.fullName,
      email: data.email || null,
      phone: authPhone || null,
      dateOfBirth: data.dateOfBirth || null,
      preferredSection: data.preferredSection || "fit",
      role: "customer",
      permissions: [
        "bookings:read",
        "bookings:write",
        "bookings:cancel",
        "services:read",
        "venues:read",
        "promotions:read",
      ],
      isActive: true,
      isVerified: false,
      isVip: false,
      pointsBalance: 100, // Welcome points
      walletBalance: 0,
      preferredLanguage: data.preferredLanguage ?? DEFAULT_LOCALE,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    });
  } else {
    // Existing user, update only allowed fields (isValidUserUpdate)
    // Avoid sending 'createdAt' as it's not allowed in updates
    const updateData: Record<string, any> = {
      fullName: data.fullName,
      updatedAt: serverTimestamp(),
    };

    if (data.email) updateData.email = data.email;
    if (data.dateOfBirth) updateData.dateOfBirth = data.dateOfBirth;
    if (data.preferredSection) updateData.preferredSection = data.preferredSection;

    await updateDoc(userRef, updateData);
  }
}

/**
 * Initialize user profile via Cloud Function
 * Called when a new user signs up or when an auth user doesn't have a Firestore document
 */
export async function initializeUserProfile(): Promise<{ success: boolean; isNewUser: boolean }> {
  console.log('[Auth] Calling initializeUserProfile Cloud Function...');
  try {
    const initProfile = httpsCallable(functions, 'initializeUserProfile');
    const result = await initProfile();
    console.log('[Auth] initializeUserProfile result:', result.data);
    return result.data as { success: boolean; isNewUser: boolean };
  } catch (error) {
    console.error('[Auth] initializeUserProfile failed:', error);
    throw error;
  }
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
 * Send the address-verification email, written in the user's language
 * (Firebase localises its templates from auth.languageCode).
 */
export async function sendVerificationEmail(user: User, locale?: AppLocale): Promise<void> {
  if (locale) auth.languageCode = locale;
  await sendEmailVerification(user);
}

/**
 * Copy Auth's verified state onto users/{uid}.emailVerified; the server also
 * marks Google/Apple sign-ins verified. Returns the resulting state.
 */
export async function syncEmailVerification(): Promise<{ emailVerified: boolean }> {
  const sync = httpsCallable<void, { emailVerified: boolean }>(functions, "syncEmailVerification");
  const result = await sync();
  return result.data;
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

/**
 * Update user profile data
 */
export async function updateUserProfile(
  userId: string,
  data: {
    fullName?: string;
    bio?: string | null;
    phone?: string | null;
    dateOfBirth?: Date;
    preferredSection?: "fit" | "fun" | "life";
    preferredLanguage?: AppLocale;
    avatarUrl?: string;
  }
): Promise<void> {
  const userRef = doc(db, "users", userId);

  const updateData: Record<string, any> = {
    ...data,
    updatedAt: serverTimestamp(),
  };

  // Convert dateOfBirth to Timestamp if provided
  if (data.dateOfBirth) {
    updateData.dateOfBirth = data.dateOfBirth;
  }

  // Remove undefined values
  Object.keys(updateData).forEach((key) => {
    if (updateData[key] === undefined) {
      delete updateData[key];
    }
  });

  await updateDoc(userRef, updateData);
}

/**
 * Update social links
 */
export async function updateSocialLinks(
  userId: string,
  socialLinks: SocialLinks
): Promise<void> {
  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, {
    socialLinks,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Update notification settings
 */
export async function updateNotificationSettings(
  userId: string,
  settings: NotificationSettings
): Promise<void> {
  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, {
    notificationSettings: settings,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Update privacy settings
 */
export async function updatePrivacySettings(
  userId: string,
  settings: PrivacySettings
): Promise<void> {
  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, {
    privacySettings: settings,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Verify phone number with OTP
 */
export async function verifyPhoneNumber(
  userId: string,
  verified: boolean = true
): Promise<void> {
  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, {
    phoneVerified: verified,
    updatedAt: serverTimestamp(),
  });
}

// Provider Profile Functions

/**
 * Update provider profile
 */
export async function updateProviderProfile(
  userId: string,
  data: Partial<ProviderProfile>
): Promise<void> {
  const userRef = doc(db, "users", userId);

  const userDoc = await getDoc(userRef);
  if (!userDoc.exists()) {
    throw new Error("User not found");
  }

  const userData = userDoc.data();
  const currentProviderProfile = userData.providerProfile || {};
  // Firestore rejects `undefined` anywhere in a map, and Partial<> lets callers pass it.
  const changes = Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );

  await updateDoc(userRef, {
    providerProfile: {
      ...currentProviderProfile,
      ...changes,
    },
    updatedAt: serverTimestamp(),
  });
}

/**
 * Get provider profile
 */
export async function getProviderProfile(
  providerId: string
): Promise<ProviderProfile | null> {
  try {
    const userDoc = await getDoc(doc(db, "users", providerId));

    if (!userDoc.exists()) {
      return null;
    }

    const data = userDoc.data();

    // Check if user is a provider
    if (data.role !== "provider" && data.role !== "admin" && data.role !== "superadmin") {
      return null;
    }

    return data.providerProfile || null;
  } catch (error) {
    console.error("Error fetching provider profile:", error);
    throw error;
  }
}

/**
 * Add certification to provider profile
 */
export async function addCertification(
  userId: string,
  certification: Omit<Certification, "id">
): Promise<string> {
  const userRef = doc(db, "users", userId);

  const certificationWithId = {
    ...certification,
    id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  };

  await updateDoc(userRef, {
    "providerProfile.certifications": arrayUnion(certificationWithId),
    updatedAt: serverTimestamp(),
  });

  return certificationWithId.id;
}

/**
 * Remove certification from provider profile
 */
export async function removeCertification(
  userId: string,
  certification: Certification
): Promise<void> {
  const userRef = doc(db, "users", userId);

  await updateDoc(userRef, {
    "providerProfile.certifications": arrayRemove(certification),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Add education to provider profile
 */
export async function addEducation(
  userId: string,
  education: Omit<Education, "id">
): Promise<string> {
  const userRef = doc(db, "users", userId);

  const educationWithId = {
    ...education,
    id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  };

  await updateDoc(userRef, {
    "providerProfile.education": arrayUnion(educationWithId),
    updatedAt: serverTimestamp(),
  });

  return educationWithId.id;
}

/**
 * Remove education from provider profile
 */
export async function removeEducation(
  userId: string,
  education: Education
): Promise<void> {
  const userRef = doc(db, "users", userId);

  await updateDoc(userRef, {
    "providerProfile.education": arrayRemove(education),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Update provider specialties
 */
export async function updateProviderSpecialties(
  userId: string,
  specialties: string[]
): Promise<void> {
  const userRef = doc(db, "users", userId);

  await updateDoc(userRef, {
    "providerProfile.specialties": specialties,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Update provider languages
 */
export async function updateProviderLanguages(
  userId: string,
  languages: string[]
): Promise<void> {
  const userRef = doc(db, "users", userId);

  await updateDoc(userRef, {
    "providerProfile.languages": languages,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Add portfolio image to provider profile
 */
export async function addPortfolioImage(
  userId: string,
  imageUrl: string
): Promise<void> {
  const userRef = doc(db, "users", userId);

  await updateDoc(userRef, {
    "providerProfile.portfolioImages": arrayUnion(imageUrl),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Remove portfolio image from provider profile
 */
export async function removePortfolioImage(
  userId: string,
  imageUrl: string
): Promise<void> {
  const userRef = doc(db, "users", userId);

  await updateDoc(userRef, {
    "providerProfile.portfolioImages": arrayRemove(imageUrl),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Check if user is a provider
 */
export async function isProvider(userId: string): Promise<boolean> {
  try {
    const userDoc = await getDoc(doc(db, "users", userId));

    if (!userDoc.exists()) {
      return false;
    }

    const data = userDoc.data();
    return data.role === "provider" || data.role === "admin" || data.role === "superadmin";
  } catch (error) {
    console.error("Error checking provider status:", error);
    return false;
  }
}

/**
 * Update user avatar URL
 */
export async function updateUserAvatar(userId: string, avatarUrl: string): Promise<void> {
  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, {
    avatarUrl,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Request phone verification (sends OTP)
 * This is handled separately through the phone auth flow
 */
export async function requestPhoneVerification(phoneNumber: string): Promise<void> {
  // This function is a placeholder - actual implementation uses Firebase Phone Auth
  // See initRecaptcha and sendOtp functions for the actual implementation
  console.log('Phone verification requested for:', phoneNumber);
}

/**
 * Verify phone code (placeholder - actual implementation in verifyOtp)
 */
export async function verifyPhoneCode(code: string): Promise<void> {
  // This function is a placeholder - actual implementation uses verifyOtp
  console.log('Phone code verification:', code);
}
