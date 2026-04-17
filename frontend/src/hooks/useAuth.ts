import { useCallback, useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  User,
  onAuthStateChanged,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";

import { auth } from "@/lib/firebase";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for result from redirect login
    getRedirectResult(auth).catch((error) => {
      if (error.code !== "auth/redirect-cancelled-by-user") {
        console.error("Auth redirect error:", error);
      }
    });

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    await signInWithRedirect(auth, provider);
  }, []);

  const signInWithEmail = useCallback(async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
  }, []);

  const signUpWithEmail = useCallback(async (email: string, pass: string) => {
    await createUserWithEmailAndPassword(auth, email, pass);
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (!user) return null;
    return user.getIdToken();
  }, [user]);

  return { 
    user, 
    loading, 
    signInWithGoogle, 
    signInWithEmail,
    signUpWithEmail,
    signOut, 
    getIdToken 
  };
}
