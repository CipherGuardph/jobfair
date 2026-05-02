import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

export async function loginWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function registerRecruiter({ displayName, companyName, email, password }) {
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

