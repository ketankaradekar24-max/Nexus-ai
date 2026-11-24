import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  onIdTokenChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import type { ModelSpec, UserProfile } from '../types';

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  models: ModelSpec[];
  loading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  getFreshToken: () => Promise<string | null>;
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
  refreshProfile: () => Promise<void>;
  refreshModels: () => Promise<void>;
  setThemeLocal: (theme: 'dark' | 'light') => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [models, setModels] = useState<ModelSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  const getFreshToken = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return null;
    const token = await user.getIdToken();
    tokenRef.current = token;
    return token;
  }, []);

  const apiFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const token = (await getFreshToken()) || tokenRef.current;
      const headers = new Headers(init.headers);
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      return fetch(url, { ...init, headers });
    },
    [getFreshToken],
  );

  const applyThemeDom = useCallback((theme: 'dark' | 'light') => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const res = await apiFetch('/api/account/me');
    if (res.ok) {
      const data = await res.json();
      setProfile(data.user);
      if (data.user?.theme === 'light' || data.user?.theme === 'dark') {
        applyThemeDom(data.user.theme);
      }
    }
  }, [apiFetch, applyThemeDom]);

  const refreshModels = useCallback(async () => {
    const res = await apiFetch('/api/models');
    if (res.ok) {
      const data = await res.json();
      setModels(data.models || []);
    }
  }, [apiFetch]);

  useEffect(() => {
    const unsub = onIdTokenChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        tokenRef.current = null;
        setProfile(null);
        setModels([]);
        setLoading(false);
        return;
      }
      try {
        const token = await user.getIdToken();
        tokenRef.current = token;
        await Promise.all([refreshProfile(), refreshModels()]);
        setAuthError(null);
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Failed to initialize session.');
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [refreshModels, refreshProfile]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign-in was cancelled or failed.');
    }
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
    tokenRef.current = null;
    setProfile(null);
  }, []);

  const setThemeLocal = useCallback(
    (theme: 'dark' | 'light') => {
      applyThemeDom(theme);
      setProfile((prev) => (prev ? { ...prev, theme } : prev));
    },
    [applyThemeDom],
  );

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        models,
        loading,
        authError,
        signInWithGoogle,
        signOut,
        getFreshToken,
        apiFetch,
        refreshProfile,
        refreshModels,
        setThemeLocal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
