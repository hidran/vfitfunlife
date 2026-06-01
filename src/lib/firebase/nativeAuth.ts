import {
  GoogleAuthProvider,
  OAuthProvider,
  PhoneAuthProvider,
  signInWithCredential,
  type Auth,
  type User,
} from 'firebase/auth';
import type { PluginListenerHandle } from '@capacitor/core';

/**
 * Native Google sign-in via @capacitor-firebase/authentication, bridged into the
 * JS Firebase SDK with signInWithCredential (the plugin runs with skipNativeAuth,
 * so the JS SDK remains the single source of auth truth). Use only on native.
 */
export async function nativeGoogleSignIn(authInstance: Auth): Promise<User> {
  const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
  const result = await FirebaseAuthentication.signInWithGoogle();
  const idToken = result.credential?.idToken;
  if (!idToken) throw new Error('No Google ID token returned from native sign-in');
  const cred = await signInWithCredential(authInstance, GoogleAuthProvider.credential(idToken));
  return cred.user;
}

/**
 * Native phone OTP request via @capacitor-firebase/authentication. Returns the
 * verificationId from the native `phoneCodeSent` event (no web reCAPTCHA needed
 * on device). Pair with nativeVerifyPhoneOtp once the user enters the code.
 */
export async function nativeSendPhoneOtp(phoneNumber: string): Promise<string> {
  const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
  let codeHandle: PluginListenerHandle | undefined;
  let failHandle: PluginListenerHandle | undefined;
  try {
    return await new Promise<string>((resolve, reject) => {
      FirebaseAuthentication.addListener('phoneCodeSent', (event) =>
        resolve(event.verificationId),
      ).then((h) => {
        codeHandle = h;
      });
      FirebaseAuthentication.addListener('phoneVerificationFailed', (event) =>
        reject(new Error(event.message || 'Phone verification failed')),
      ).then((h) => {
        failHandle = h;
      });
      FirebaseAuthentication.signInWithPhoneNumber({ phoneNumber }).catch(reject);
    });
  } finally {
    codeHandle?.remove();
    failHandle?.remove();
  }
}

/** Verify a native phone OTP and bridge the credential into the JS SDK. */
export async function nativeVerifyPhoneOtp(
  authInstance: Auth,
  verificationId: string,
  code: string,
): Promise<User> {
  const credential = PhoneAuthProvider.credential(verificationId, code);
  const cred = await signInWithCredential(authInstance, credential);
  return cred.user;
}

/** Native Apple sign-in, bridged into the JS SDK (uses the nonce the plugin generated). */
export async function nativeAppleSignIn(authInstance: Auth): Promise<User> {
  const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
  const result = await FirebaseAuthentication.signInWithApple();
  const idToken = result.credential?.idToken;
  if (!idToken) throw new Error('No Apple ID token returned from native sign-in');
  const provider = new OAuthProvider('apple.com');
  const cred = await signInWithCredential(
    authInstance,
    provider.credential({ idToken, rawNonce: result.credential?.nonce })
  );
  return cred.user;
}
