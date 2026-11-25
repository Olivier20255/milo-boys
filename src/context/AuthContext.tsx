import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User as FirebaseUser } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { apiFetch, registerTokenGetter } from '../lib/api';

export interface AuthUserProfile {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  roleId: number;
  roleCode: 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'HEADTEACHER' | 'TEACHER' | 'ACCOUNTANT' | 'STUDENT' | 'PARENT';
  roleName: string;
  isActive: boolean;
  linkedStudentId: number | null;
  linkedGuardianId: number | null;
  linkedStaffId: number | null;
  permissions: string[];
}

export interface SchoolSettingsData {
  id: number;
  schoolName: string;
  motto: string;
  code: string;
  email: string;
  phone: string;
  address: string;
  county: string;
  rankStudentsInReports: boolean;
  mpesaShortcode: string | null;
  mpesaEnv: string | null;
  mpesaConfigured: boolean;
  emailConfigured: boolean;
  smsConfigured: boolean;
}

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  user: AuthUserProfile | null;
  schoolSettings: SchoolSettingsData | null;
  currentYear: { id: number; name: string } | null;
  currentTerm: { id: number; name: string } | null;
  unreadNotificationsCount: number;
  loading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  hasPermission: (code: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<AuthUserProfile | null>(null);
  const [schoolSettings, setSchoolSettings] = useState<SchoolSettingsData | null>(null);
  const [currentYear, setCurrentYear] = useState<{ id: number; name: string } | null>(null);
  const [currentTerm, setCurrentTerm] = useState<{ id: number; name: string } | null>(null);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const loadBackendProfile = useCallback(async () => {
    try {
      setAuthError(null);
      const data = await apiFetch<{
        user: AuthUserProfile;
        schoolSettings: SchoolSettingsData | null;
        currentAcademicYear: { id: number; name: string } | null;
        currentTerm: { id: number; name: string } | null;
        unreadNotificationsCount: number;
      }>('/api/auth/me');
      setUser(data.user);
      setSchoolSettings(data.schoolSettings);
      setCurrentYear(data.currentAcademicYear);
      setCurrentTerm(data.currentTerm);
      setUnreadNotificationsCount(data.unreadNotificationsCount);
    } catch (err: any) {
      console.error('Failed to sync profile:', err);
      setAuthError(err?.message || 'Unable to verify institutional profile.');
      setUser(null);
    }
  }, []);

  useEffect(() => {
    registerTokenGetter(async () => {
      if (!auth.currentUser) return null;
      return auth.currentUser.getIdToken();
    });

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        await loadBackendProfile();
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsub();
  }, [loadBackendProfile]);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err: any) {
      setAuthError(err?.message || 'Google Sign-In was cancelled or failed.');
    }
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setFirebaseUser(null);
  };

  const hasPermission = useCallback(
    (code: string) => {
      if (!user) return false;
      if (user.roleCode === 'SUPER_ADMIN') return true;
      return user.permissions.includes(code);
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        user,
        schoolSettings,
        currentYear,
        currentTerm,
        unreadNotificationsCount,
        loading,
        authError,
        signInWithGoogle,
        logout,
        refreshProfile: loadBackendProfile,
        hasPermission,
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
