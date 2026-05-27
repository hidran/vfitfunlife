import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  type Auth,
  type User,
} from 'firebase/auth';

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
