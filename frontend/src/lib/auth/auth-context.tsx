"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { tokenStorage } from "@/lib/auth/token-storage";
import { TokenResponse, User, UserRole } from "@/types";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (email: string, password: string, role: UserRole) => Promise<User>;
  logout: () => void;
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();
  const queryClient = useQueryClient();

  const fetchCurrentUser = useCallback(async (): Promise<User | null> => {
    if (!tokenStorage.hasTokens()) {
      setUser(null);
      setIsLoading(false);
      return null;
    }

    try {
      const currentUser = await apiClient.get<User>("/auth/me");
      setUser(currentUser);
      return currentUser;
    } catch (err) {
      console.warn("Failed to retrieve current user session:", err);
      tokenStorage.clearTokens();
      queryClient.clear();
      setUser(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [queryClient]);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  const login = async (email: string, password: string): Promise<User> => {
    setIsLoading(true);
    try {
      const tokenData = await apiClient.post<TokenResponse>(
        "/auth/login",
        { email, password },
        { requiresAuth: false }
      );

      tokenStorage.setTokens(tokenData.access_token, tokenData.refresh_token);

      // Backend TokenResponse includes the populated UserResponse
      if (tokenData.user) {
        setUser(tokenData.user);
        return tokenData.user;
      }

      const currentUser = await apiClient.get<User>("/auth/me");
      setUser(currentUser);
      return currentUser;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (
    email: string,
    password: string,
    role: UserRole
  ): Promise<User> => {
    setIsLoading(true);
    try {
      // 1. Create account via /auth/register
      const newUser = await apiClient.post<User>(
        "/auth/register",
        { email, password, role },
        { requiresAuth: false }
      );

      // 2. Automatically log in with credentials to obtain JWT session
      await login(email, password);

      return newUser;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = useCallback(() => {
    tokenStorage.clearTokens();
    queryClient.clear();
    setUser(null);
    router.push("/login");
  }, [router, queryClient]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: Boolean(user),
        login,
        register,
        logout,
        refreshUser: fetchCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
