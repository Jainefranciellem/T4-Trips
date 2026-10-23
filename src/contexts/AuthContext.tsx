import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { apiFetch } from '@/lib/api';
import { getAccessToken, setTokens, clearTokens } from '@/lib/auth-storage';
import type { Permission, SessionUser } from '@/types';

const USER_KEY = 'T4Trips_user';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

interface AuthContextType {
  user: SessionUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  can: (permission: Permission) => boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearSession = useCallback(() => {
    setUser(null);
    localStorage.removeItem(USER_KEY);
    clearTokens();
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(USER_KEY);
    if (!stored || !getAccessToken()) {
      clearSession();
      setIsLoading(false);
      return;
    }

    try {
      setUser(JSON.parse(stored));
    } catch {
      clearSession();
      setIsLoading(false);
      return;
    }
    setIsLoading(false);

    // Perfil/permissões podem ter mudado desde o último acesso.
    apiFetch<SessionUser>('/auth/me')
      .then((fresh) => {
        setUser(fresh);
        localStorage.setItem(USER_KEY, JSON.stringify(fresh));
      })
      .catch(() => {
        /* 401 já é tratado pelo apiFetch (volta pro login) */
      });
  }, [clearSession]);

  const login: AuthContextType['login'] = async (email, password) => {
    try {
      const response = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setTokens(response.accessToken, response.refreshToken);
      setUser(response.user);
      localStorage.setItem(USER_KEY, JSON.stringify(response.user));
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'E-mail ou senha incorretos',
      };
    }
  };

  const logout = () => {
    // Melhor esforço: registra o encerramento da sessão na auditoria.
    apiFetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
    clearSession();
  };

  const can = (permission: Permission) => !!user?.permissions.includes(permission);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, can, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
