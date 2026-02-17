"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { setAccessToken, refreshAccessToken, fetchMe, logoutAPI } from "@/lib/api";
import { migrateLocalToServer } from "@/lib/watchlist";

interface User {
  id: number;
  email: string;
  name: string;
  avatar_url: string;
  provider: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (provider: "google") => void;
  logout: () => Promise<void>;
  setToken: (token: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: () => {},
  logout: async () => {},
  setToken: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

const BACKEND_URL = "http://localhost:8000";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Try to restore session on mount
  useEffect(() => {
    (async () => {
      try {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          const me = await fetchMe();
          setUser(me);
        }
      } catch {
        // Not logged in
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback((provider: "google") => {
    window.location.href = `${BACKEND_URL}/api/auth/login/${provider}`;
  }, []);

  const logout = useCallback(async () => {
    await logoutAPI();
    setUser(null);
  }, []);

  const setToken = useCallback(async (token: string) => {
    setAccessToken(token);
    try {
      const me = await fetchMe();
      setUser(me);
      // Migrate localStorage watchlist to server
      await migrateLocalToServer();
    } catch {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        setToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
