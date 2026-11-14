import { getAuthClient } from '../firebase/client';
import { authErrorCode } from './errors';

/**
 * Sign-in actions (spec 01 R4.1). Each one imports firebase/auth on demand and throws the
 * Firebase error unchanged; the UI turns it into copy with `authErrorMessage`.
 */

export async function signInWithGoogle(): Promise<void> {
  const auth = await getAuthClient();
  const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const auth = await getAuthClient();
  const { signInWithEmailAndPassword } = await import('firebase/auth');
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function createAccount(email: string, password: string): Promise<void> {
  const auth = await getAuthClient();
  const { createUserWithEmailAndPassword } = await import('firebase/auth');
  await createUserWithEmailAndPassword(auth, email.trim(), password);
}

export async function sendReset(email: string): Promise<void> {
  const auth = await getAuthClient();
  const { sendPasswordResetEmail } = await import('firebase/auth');
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (err) {
    // Same answer whether or not the account exists, so the form can't be used to probe emails
    // (production has email enumeration protection; the emulator still reports this code).
    if (authErrorCode(err) !== 'auth/user-not-found') throw err;
  }
}

export async function signOutUser(): Promise<void> {
  const auth = await getAuthClient();
  const { signOut } = await import('firebase/auth');
  await signOut(auth);
}
