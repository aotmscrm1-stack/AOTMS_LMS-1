import { useState, useEffect, createContext, useContext, ReactNode, useCallback, useRef } from 'react';
import { UserRole } from '@/types/auth';
import { API_URL, refreshAccessToken, parseJsonResponse } from '@/lib/api';

// Simplified types to replace backend user types
interface User {
  id: string;
  email?: string;
  role?: string;
  full_name?: string;
  avatar_url?: string;
  user_metadata?: {
    full_name?: string;
    avatar_url?: string;
    [key: string]: unknown;
  };
  approval_status?: string;
  [key: string]: unknown;
}

interface Session {
  access_token: string;
  user: User | null;
  [key: string]: unknown;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: UserRole | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string, phone?: string, courseType?: string, collegeName?: string, locationData?: { city?: string; district?: string; country?: string; fullAddress?: string; latitude?: number; longitude?: number }, instituteName?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; requiresAdminOtp?: boolean }>;
  verifyAdminOtp: (email: string, otp: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  checkSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const getTokenExpiryMs = (token: string): number | null => {
  try {
    const payloadBase64 = token.split('.')[1];
    if (!payloadBase64) return null;
    const json = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json);
    if (payload && typeof payload.exp === 'number') {
      return payload.exp * 1000;
    }
  } catch {
    return null;
  }
  return null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialize state from localStorage for instant persistence on refresh
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('user');
    if (!saved || saved === 'undefined') return null;
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse user from storage:', e);
      return null;
    }
  });

  const [session, setSession] = useState<Session | null>(() => {
    const token = localStorage.getItem('access_token');
    if (!token || token === 'undefined') return null;
    const savedUser = localStorage.getItem('user');
    let parsedUser = null;
    if (savedUser && savedUser !== 'undefined') {
      try {
        parsedUser = JSON.parse(savedUser);
      } catch (e) {
        console.error('Failed to parse user for session:', e);
      }
    }
    return {
      access_token: token,
      user: parsedUser
    } as Session;
  });

  const [userRole, setUserRole] = useState<UserRole | null>(() => {
    const role = localStorage.getItem('user_role');
    return (role && role !== 'undefined') ? (role as UserRole) : null;
  });

  const [loading, setLoading] = useState(true);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearRefreshTimer = () => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  };

  const scheduleSilentRefresh = useCallback((token: string) => {
    clearRefreshTimer();
    const expiryMs = getTokenExpiryMs(token);
    if (!expiryMs) return;

    const remainingMs = expiryMs - Date.now();
    // Schedule refresh 2 minutes before expiry (or immediately if less than 2 mins remain)
    const refreshInMs = Math.max(10000, remainingMs - 2 * 60 * 1000);

    refreshTimerRef.current = setTimeout(async () => {
      try {
        const newToken = await refreshAccessToken();
        setSession(prev => prev ? { ...prev, access_token: newToken } : { access_token: newToken, user: null });
        scheduleSilentRefresh(newToken);
      } catch (e) {
        console.warn('Proactive silent refresh attempt failed:', e);
      }
    }, refreshInMs);
  }, []);

  const signOut = useCallback(async () => {
    clearRefreshTimer();
    try {
      const token = localStorage.getItem('access_token');
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      localStorage.removeItem('user_role');
      setUser(null);
      setSession(null);
      setUserRole(null);
      setLoading(false);
    }
  }, []);

  const checkSession = useCallback(async () => {
    let token = localStorage.getItem('access_token');

    // If no access token, try refreshing from HttpOnly cookie first
    if (!token) {
      try {
        token = await refreshAccessToken();
      } catch {
        setLoading(false);
        return;
      }
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      let profileRes = await fetch(`${API_URL}/user/profile`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // If access token is expired (401), attempt a silent refresh once
      if (profileRes.status === 401) {
        try {
          token = await refreshAccessToken();
          profileRes = await fetch(`${API_URL}/user/profile`, {
            headers: { Authorization: `Bearer ${token}` },
            credentials: 'include'
          });
        } catch (refreshErr) {
          console.warn('Refresh failed during checkSession:', refreshErr);
          await signOut();
          return;
        }
      }

      if (profileRes.status === 403) {
        console.warn('Profile access forbidden: Skipping update');
        setLoading(false);
        return;
      }

      if (!profileRes.ok) {
        setLoading(false);
        return;
      }

      const { user: userData } = await parseJsonResponse<any>(profileRes);

      setUser(userData);
      setSession({ access_token: token, user: userData } as Session);
      if (userData) {
        localStorage.setItem('user', JSON.stringify(userData));
      }

      if (userData.role) {
        const freshRole = userData.role as UserRole;
        setUserRole(freshRole);
        localStorage.setItem('user_role', freshRole);
      }

      // Schedule next proactive silent refresh
      scheduleSilentRefresh(token);

    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('Session check timed out, keeping current local session');
        setLoading(false);
        return;
      }

      console.error('Session validation error:', error);
    } finally {
      setLoading(false);
    }
  }, [signOut, scheduleSilentRefresh]);

  // Initial authentication check on app load
  useEffect(() => {
    const initAuth = async () => {
      await checkSession();
    };
    initAuth();
    return () => clearRefreshTimer();
  }, [checkSession]);

  // Listen for tokens refreshed by other parts of the app (e.g. fetchWithAuth)
  useEffect(() => {
    const handleTokenRefreshed = (e: Event) => {
      const customEvent = e as CustomEvent<{ token: string }>;
      const newToken = customEvent.detail?.token;
      if (newToken) {
        setSession(prev => prev ? { ...prev, access_token: newToken } : { access_token: newToken, user } as Session);
        scheduleSilentRefresh(newToken);
      }
    };

    window.addEventListener('auth:token_refreshed', handleTokenRefreshed);
    return () => window.removeEventListener('auth:token_refreshed', handleTokenRefreshed);
  }, [user, scheduleSilentRefresh]);

  // Periodic role / status sync every 5 minutes (resilient, no auto-logout on hiccups)
  useEffect(() => {
    if (!user?.id) return;
    const interval = setInterval(() => {
      checkSession();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user?.id, checkSession]);

  const signUp = useCallback(async (
    email: string,
    password: string,
    fullName: string,
    phone?: string,
    courseType?: string,
    collegeName?: string,
    locationData?: { city?: string; district?: string; country?: string; fullAddress?: string; latitude?: number; longitude?: number },
    instituteName?: string
  ) => {
    try {
      const res = await fetch(`${API_URL}/auth/signup`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email, 
          password, 
          fullName, 
          phone, 
          courseType, 
          collegeName,
          instituteName,
          city: locationData?.city,
          district: locationData?.district,
          country: locationData?.country,
          fullAddress: locationData?.fullAddress,
          latitude: locationData?.latitude,
          longitude: locationData?.longitude
        }),
      });

      const data = await parseJsonResponse<any>(res);

      if (!res.ok) {
        return { error: new Error(data.error || 'Signup failed') };
      }

      if (data.session) {
        localStorage.setItem('access_token', data.session.access_token);
        const newUser = { ...data.user, approval_status: 'pending' };
        if (newUser) {
          localStorage.setItem('user', JSON.stringify(newUser));
        }
        const signupRole = data.user?.role || 'student';
        localStorage.setItem('user_role', signupRole);

        setUser(newUser);
        setSession(data.session);
        setUserRole(signupRole as UserRole);
        scheduleSilentRefresh(data.session.access_token);
      }
      return { error: null };
    } catch (error: unknown) {
      if (error instanceof Error) return { error };
      return { error: new Error('Unknown error during signup') };
    }
  }, [scheduleSilentRefresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await parseJsonResponse<any>(res);

      if (!res.ok) {
        setLoading(false);
        return { error: new Error(data.error || 'Login failed') };
      }

      if (data.requiresOtp) {
        setLoading(false);
        return { error: null, requiresAdminOtp: true };
      }

      if (data.session) {
        localStorage.setItem('access_token', data.session.access_token);
        const userData = data.user;
        const role = userData.role || 'student';

        if (userData) {
          localStorage.setItem('user', JSON.stringify(userData));
        }
        localStorage.setItem('user_role', role);

        setUser(userData);
        setSession(data.session);
        setUserRole(role);
        scheduleSilentRefresh(data.session.access_token);
      }

      setLoading(false);
      return { error: null };
    } catch (error: unknown) {
      setLoading(false);
      if (error instanceof Error) return { error };
      return { error: new Error('Unknown error during signin') };
    }
  }, [scheduleSilentRefresh]);

  const verifyAdminOtp = useCallback(async (email: string, otp: string) => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/auth/admin-verify-otp`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });

      const data = await parseJsonResponse<any>(res);

      if (!res.ok) {
        setLoading(false);
        return { error: new Error(data.error || 'OTP verification failed') };
      }

      if (data.session) {
        localStorage.setItem('access_token', data.session.access_token);
        const userData = data.user;
        const role = userData.role || 'admin';
        if (userData) {
          localStorage.setItem('user', JSON.stringify(userData));
        }
        localStorage.setItem('user_role', role);
        setUser(userData);
        setSession(data.session);
        setUserRole(role as UserRole);
        scheduleSilentRefresh(data.session.access_token);
      }

      setLoading(false);
      return { error: null };
    } catch (error: unknown) {
      setLoading(false);
      if (error instanceof Error) return { error };
      return { error: new Error('Unknown error during OTP verification') };
    }
  }, [scheduleSilentRefresh]);

  return (
    <AuthContext.Provider value={{ user, session, userRole, loading, signUp, signIn, signOut, checkSession, verifyAdminOtp }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}