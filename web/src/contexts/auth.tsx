import React, { useState, useEffect } from "react";
import { type User, trpc } from "@servs/index";
import { AuthContext } from "@hooks/index";

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isRefreshing: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const utils = trpc.useUtils();

  const loginMutation = trpc.login.useMutation();
  const registerMutation = trpc.register.useMutation();
  const refreshMutation = trpc.refresh.useMutation();
  const logoutMutation = trpc.logout.useMutation();
  const meQuery = trpc.me.useQuery(undefined, {
    enabled: false,
    retry: false,
  });

  // Initialize auth state
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Try to get current user
        const result = await meQuery.refetch();
        if (result.data?.user) {
          setUser(result.data.user);
        }
      } catch (error) {
        console.log("No valid session found");
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const result = await loginMutation.mutateAsync({ email, pass: password });
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
      setUser(result.user);
    } catch (error) {
      console.error("Registration error:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setUser(null);
      utils.invalidate();
    }
  };

  const refreshSession = async (): Promise<void> => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      const result = await refreshMutation.mutateAsync();
      setUser(result.user);
    } catch (error) {
      setUser(null);
      throw error;
    } finally {
      setIsRefreshing(false);
    }
  };

  // Periodically refresh access token
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(async () => {
      try {
        await refreshSession();
      } catch (error) {
        console.log("Session refresh failed, logging out");
        await logout();
      }
    }, 14 * 60 * 1000); // Refresh every 14 minutes

    return () => clearInterval(interval);
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isRefreshing,
        login,
        register,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
