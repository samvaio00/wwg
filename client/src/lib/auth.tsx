import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "./queryClient";
import type { SafeUser } from "@shared/schema";

interface AuthContextType {
  user: SafeUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  authError: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  setupAdmin: (data: RegisterData) => Promise<void>;
  refreshAuth: () => void;
  clearAuthError: () => void;
}

interface RegisterData {
  email: string;
  password: string;
  businessName?: string;
  contactName?: string;
  dateOfBirth?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  emailOptIn?: boolean;
  certificateUrl?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [authError, setAuthError] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery<{ user: SafeUser }>({
    queryKey: ["/api/auth/me"],
    retry: 2,
    retryDelay: 1000,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60 * 1000,
  });

  const user = data?.user ?? null;
  const isAuthenticated = !!user;

  useEffect(() => {
    if (error) {
      const errorMessage = error instanceof Error ? error.message : "Authentication check failed";
      if (!errorMessage.includes("sign in")) {
        console.warn("Auth check error:", errorMessage);
      }
    }
  }, [error]);

  useEffect(() => {
    const handleOnline = () => {
      refetch();
    };
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const lastCheck = queryClient.getQueryState(["/api/auth/me"])?.dataUpdatedAt || 0;
        const staleTime = 2 * 60 * 1000;
        if (Date.now() - lastCheck > staleTime) {
          refetch();
        }
      }
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refetch, queryClient]);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const refreshAuth = useCallback(() => {
    refetch();
  }, [refetch]);

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const response = await apiRequest("POST", "/api/auth/login", { email, password });
      return response.json();
    },
    onSuccess: (data) => {
      setAuthError(null);
      queryClient.setQueryData(["/api/auth/me"], { user: data.user });
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
    onError: (error: Error) => {
      setAuthError(error.message);
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterData) => {
      const response = await apiRequest("POST", "/api/auth/register", data);
      return response.json();
    },
    onSuccess: () => {
      setAuthError(null);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (error: Error) => {
      setAuthError(error.message);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/logout", {});
      return response.json();
    },
    onSuccess: () => {
      setAuthError(null);
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.clear();
    },
    onError: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.clear();
    },
  });

  const setupAdminMutation = useMutation({
    mutationFn: async (data: RegisterData) => {
      const response = await apiRequest("POST", "/api/admin/setup", data);
      return response.json();
    },
    onSuccess: () => {
      setAuthError(null);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (error: Error) => {
      setAuthError(error.message);
    },
  });

  const login = async (email: string, password: string) => {
    setAuthError(null);
    await loginMutation.mutateAsync({ email, password });
  };

  const register = async (data: RegisterData) => {
    setAuthError(null);
    await registerMutation.mutateAsync(data);
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  const setupAdmin = async (data: RegisterData) => {
    setAuthError(null);
    await setupAdminMutation.mutateAsync(data);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated,
        authError,
        login,
        register,
        logout,
        setupAdmin,
        refreshAuth,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
