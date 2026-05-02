import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

function requireAuth() {
  if (!auth) {
    throw new Error('Firebase Authentication is not available. Check your Firebase configuration.');
  }
}

function requireDb() {
  if (!db) {
    throw new Error('Firestore is not available. Check your Firebase configuration.');
  }
}

export async function loginWithEmail(email, password) {
  requireAuth();
  return signInWithEmailAndPassword(auth, email, password);
}

export async function registerRecruiter({ displayName, companyName, email, password }) {
  requireAuth();
  requireDb();
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName });

  await setDoc(doc(db, 'users', credential.user.uid), {
    uid: credential.user.uid,
    displayName,
    email,
    role: 'hr',
    companyName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return credential;
}
