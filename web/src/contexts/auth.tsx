import React, { useState, useEffect } from "react";
import { type User, trpc } from "@servs/index";
import { AuthContext } from "@hooks/index";

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password?: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<string | null>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const utils = trpc.useUtils();

  const loginMutation = trpc.login.useMutation();
  const registerMutation = trpc.register.useMutation();
  const refreshTokenMutation = trpc.refreshToken.useMutation();

  // Initialize auth state from stored tokens
  useEffect(() => {
    const initAuth = async () => {
      try {
        setIsLoading(false);
      } catch (error) {
        console.error("Auth initialization error:", error);
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const result = await loginMutation.mutateAsync({ email, pass: password });

      // Store tokens
      localStorage.setItem("accessToken", result.accessToken);
      localStorage.setItem("refreshToken", result.refreshToken);

      // Update user state
      setUser(result.user);
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password?: string) => {
    setIsLoading(true);
    try {
      const result = await registerMutation.mutateAsync({
        email,
        pass: password,
      });

      // Store tokens
      localStorage.setItem("accessToken", result.accessToken);
      localStorage.setItem("refreshToken", result.refreshToken);

      // Update user state
      setUser(result.user);
    } catch (error) {
      console.error("Registration error:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    // Clear tokens
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");

    // Clear user state
    setUser(null);

    // Invalidate all queries
    utils.invalidate();
  };

  const refreshToken = async (): Promise<string | null> => {
    try {
      const refreshToken = localStorage.getItem("refreshToken");
      if (!refreshToken) return null;

      const result = await refreshTokenMutation.mutateAsync({ refreshToken });
      localStorage.setItem("accessToken", result.accessToken);
      return result.accessToken;
    } catch (error) {
      console.error("Token refresh error:", error);
      logout(); // Force logout on refresh failure
      return null;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        register,
        logout,
        refreshToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
