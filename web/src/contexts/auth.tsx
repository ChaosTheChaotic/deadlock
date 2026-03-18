import React, { useState, useEffect, useCallback } from "react"; // Added useCallback
import { type User, trpc, qc } from "@servs/index";
import { AuthContext } from "@hooks/index";

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isRefreshing: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  hasRole: (role: string) => boolean;
  hasPerm: (perm: string) => boolean;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const utils = trpc.useUtils();

  const loginMutation = trpc.login.useMutation();
  const registerMutation = trpc.register.useMutation();
  const refreshMutation = trpc.refresh.useMutation();
  const logoutMutation = trpc.logout.useMutation({
    onMutate: async () => {
      await qc.cancelQueries();
    },
    onSuccess: () => {
      qc.clear();
      window.location.href = "/login";
    },
  });
  const { refetch } = trpc.me.useQuery(undefined, {
    enabled: false,
    retry: false,
  });

  useEffect(() => {
    const initAuth = async () => {
      try {
        const result = await refetch();
        if (result.data?.user) {
          setUser(result.data.user);
        }
      } catch (e) {
        console.log(`No valid session found: ${e}`);
      } finally {
        setIsLoading(false);
      }
    };

    void initAuth();
  }, [refetch]);

  const login = useCallback(
    async (email: string, password: string) => {
      setIsLoading(true);
      try {
        const result = await loginMutation.mutateAsync({
          email,
          pass: password,
        });
        setUser(result.user);
      } catch (error) {
        console.error("Login error:", error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [loginMutation],
  );

  const register = useCallback(
    async (email: string, password?: string) => {
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
    },
    [registerMutation],
  );

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setUser(null);
      void utils.invalidate();
    }
  }, [logoutMutation, utils]);

  const refreshSession = useCallback(async (): Promise<void> => {
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
  }, [isRefreshing, refreshMutation]);

  useEffect(() => {
    if (!user) return;

    const interval = setInterval(
      async () => {
        try {
          await refreshSession();
        } catch (e) {
          console.log(`Session refresh failed, logging out: ${e}`);
          await logout();
        }
      },
      14 * 60 * 1000,
    );

    return () => clearInterval(interval);
  }, [user, logout, refreshSession]);

  const hasRole = useCallback(
    (role: string) => {
      return !!user?.roles?.includes(role);
    },
    [user],
  );

  const hasPerm = useCallback(
    (perm: string) => {
      return !!user?.perms?.includes(perm);
    },
    [user],
  );

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
        hasRole,
        hasPerm,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
