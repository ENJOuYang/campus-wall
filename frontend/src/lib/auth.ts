import { getBackendBaseUrl } from "./posts";

export type UserInfo = {
  id: number;
  username: string;
  nickname: string;
  phone: string | null;
  email: string | null;
  role: string;
  created_at: string;
};

export type TokenResponse = {
  access_token: string;
  token_type: string;
  user: UserInfo;
};

const TOKEN_KEY = "cw_token";
const USER_KEY = "cw_user";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): UserInfo | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserInfo;
  } catch {
    return null;
  }
}

function saveAuth(token: string, user: UserInfo) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (user.role === "admin" || user.role === "super_admin") {
    sessionStorage.setItem("admin_token", token);
    sessionStorage.setItem("admin_role", user.role);
  }
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem("admin_token");
  sessionStorage.removeItem("admin_role");
}

export async function register(params: {
  username: string;
  nickname: string;
  password: string;
  phone?: string;
  email?: string;
  invite_code?: string;
}): Promise<TokenResponse> {
  const res = await fetch(`${getBackendBaseUrl()}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || "注册失败");
  }
  const data: TokenResponse = await res.json();
  saveAuth(data.access_token, data.user);
  return data;
}

export async function login(account: string, password: string): Promise<TokenResponse> {
  const res = await fetch(`${getBackendBaseUrl()}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account, password }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || "登录失败");
  }
  const data: TokenResponse = await res.json();
  saveAuth(data.access_token, data.user);
  return data;
}

export async function fetchMe(): Promise<UserInfo> {
  const token = getStoredToken();
  if (!token) throw new Error("未登录");
  const res = await fetch(`${getBackendBaseUrl()}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    clearAuth();
    throw new Error("登录已过期");
  }
  return res.json();
}

export function authHeaders(): Record<string, string> {
  const token = getStoredToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
