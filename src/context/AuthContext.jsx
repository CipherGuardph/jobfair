import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, firebaseReady } from '../services/firebase';

const AuthContext = createContext(null);

async function ensureUserDoc(user, extra = {}) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  const base = {
    uid: user.uid,
    displayName: user.displayName || extra.displayName || '',
    email: user.email || extra.email || '',
    role: extra.role || 'hr',
    companyName: extra.companyName || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  if (!snap.exists()) {
    await setDoc(ref, base, { merge: true });
    return base;
  }

  const next = {
    displayName: user.displayName || snap.data().displayName || '',
    email: user.email || snap.data().email || '',
    updatedAt: serverTimestamp()
  };
  await updateDoc(ref, next);
  return { ...snap.data(), ...next };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseReady || !auth || !db) {
      setUser(null);
      setProfile(null);
      setLoading(false);
      return () => {};
    }

    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      setUser(authUser);
      if (!authUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const ref = doc(db, 'users', authUser.uid);
      const snap = await getDoc(ref);
      setProfile(snap.exists() ? snap.data() : null);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const value = useMemo(() => ({
    user,
    profile,
    loading,
    refreshProfile: async () => {
      if (!firebaseReady || !auth || !db) return null;
      if (!auth.currentUser) return null;
      const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const next = snap.exists() ? snap.data() : null;
      setProfile(next);
      return next;
    },
    ensureUserDoc
  }), [user, profile, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  return useContext(AuthContext);
}
