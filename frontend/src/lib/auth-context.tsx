"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  type UserInfo,
  clearAuth,
  fetchMe,
  getStoredToken,
  getStoredUser,
  login as apiLogin,
  register as apiRegister,
} from "./auth";

type AuthState = {
  user: UserInfo | null;
  loading: boolean;
  login: (account: string, password: string) => Promise<void>;
  register: (params: {
    username: string;
    nickname: string;
    password: string;
    phone?: string;
    email?: string;
      invite_code?: string;
  }) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    const cached = getStoredUser();
    if (token && cached) {
      setUser(cached);
      if (cached.role === "admin" || cached.role === "super_admin") {
        sessionStorage.setItem("admin_token", token);
        sessionStorage.setItem("admin_role", cached.role);
      }
      fetchMe()
        .then((u) => {
          setUser(u);
          if (u.role === "admin" || u.role === "super_admin") {
            sessionStorage.setItem("admin_token", token);
            sessionStorage.setItem("admin_role", u.role);
          }
        })
        .catch(() => {
          clearAuth();
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (account: string, password: string) => {
    const data = await apiLogin(account, password);
    setUser(data.user);
  }, []);

  const register = useCallback(
    async (params: {
      username: string;
      nickname: string;
      password: string;
      phone?: string;
      email?: string;
      invite_code?: string;
    }) => {
      const data = await apiRegister(params);
      setUser(data.user);
    },
    []
  );

  const logout = useCallback(() => {
    clearAuth();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
