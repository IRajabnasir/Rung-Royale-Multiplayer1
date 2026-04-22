import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  signInAnonymously,
  updateProfile,
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

/**
 * Google Sign-In that works on both web and native (iOS / Android via Capacitor).
 *
 * On native, `signInWithPopup` is unreliable inside a WebView — popups are
 * blocked by iOS and the redirect flow mangles the callback URL. We route
 * through the Capacitor Firebase Authentication plugin, grab a Google ID
 * token, and hand it to the JS SDK via `signInWithCredential` so the rest of
 * the app (Firestore listeners, etc.) sees the same auth state.
 */
export const signInWithGoogle = async () => {
  try {
    if (Capacitor.isNativePlatform()) {
      const result = await FirebaseAuthentication.signInWithGoogle();
      const idToken = result.credential?.idToken;
      if (!idToken) throw new Error('No Google ID token returned from native sign-in');
      const credential = GoogleAuthProvider.credential(idToken);
      const userCredential = await signInWithCredential(auth, credential);
      return userCredential.user;
    }
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Error signing in with Google', error);
    throw error;
  }
};

/**
 * Guest / anonymous sign-in. Creates a real Firebase anonymous user so
 * Firestore rules pass and multiplayer works. The guest's displayName is
 * set so they show up as `Guest_XXXXXX` everywhere.
 */
export const signInAsGuest = async (isPrivate = false) => {
  const cred = await signInAnonymously(auth);
  const short = cred.user.uid.slice(-6).toUpperCase();
  const displayName = `${isPrivate ? 'Shadow' : 'Guest'}_${short}`;
  try {
    await updateProfile(cred.user, { displayName });
  } catch (e) {
    console.warn('updateProfile failed', e);
  }
  return cred.user;
};

// Lightweight connection test (fire-and-forget)
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();
