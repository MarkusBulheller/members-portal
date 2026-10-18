import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi } from '../lib/api/auth';
import { ApiError } from '../lib/api';
import type { User } from '../types/user';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  refetch: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const me = await authApi.me();
      setUser(me);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
      } else {
        throw error;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, refetch, logout }), [user, loading, refetch, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
