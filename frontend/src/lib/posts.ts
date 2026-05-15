export type Post = {
  id: number;
  title: string;
  body: string;
  category: string;
  created_at: string;
  image_urls: string[];
  view_count: number;
  like_count: number;
  is_liked: boolean;
  status: string;
  ticket_status: string | null;
};

export type PostListResponse = {
  items: Post[];
  total: number;
};

export type Comment = {
  id: number;
  post_id: number;
  body: string;
  fingerprint: string;
  created_at: string;
};

export type Report = {
  id: number;
  post_id: number;
  reason: string;
  fingerprint: string;
  created_at: string;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
};

export function getBackendBaseUrl(): string {
  return process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
}

export async function fetchPostList(
  skip = 0,
  limit = 20,
  sort = "latest",
  fingerprint = ""
): Promise<PostListResponse> {
  const params = new URLSearchParams({ skip: String(skip), limit: String(limit), sort });
  if (fingerprint) params.set("fingerprint", fingerprint);
  const url = `${getBackendBaseUrl()}/api/posts?${params}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`加载帖子失败：HTTP ${res.status}`);
  }
  return (await res.json()) as PostListResponse;
}

export async function fetchPostById(id: number, fingerprint = ""): Promise<Post> {
  const params = fingerprint ? `?fingerprint=${encodeURIComponent(fingerprint)}` : "";
  const res = await fetch(`${getBackendBaseUrl()}/api/posts/${id}${params}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(res.status === 404 ? "帖子不存在" : `加载帖子失败：HTTP ${res.status}`);
  }
  return (await res.json()) as Post;
}

export async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/uploads", { method: "POST", body: fd });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || "图片上传失败");
  }
  const data = await res.json();
  return data.url;
}

export async function toggleLike(
  postId: number,
  fingerprint: string
): Promise<{ liked: boolean; like_count: number }> {
  const res = await fetch(`/api/posts/${postId}/like`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fingerprint }),
  });
  if (!res.ok) throw new Error("操作失败");
  return res.json();
}

export async function fetchComments(postId: number): Promise<Comment[]> {
  const res = await fetch(`${getBackendBaseUrl()}/api/posts/${postId}/comments`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("加载评论失败");
  return res.json();
}

export async function createComment(
  postId: number,
  body: string,
  fingerprint: string
): Promise<Comment> {
  const res = await fetch(`/api/posts/${postId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body, fingerprint }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || "评论失败");
  }
  return res.json();
}

export async function incrementView(postId: number): Promise<void> {
  try {
    await fetch(`/api/posts/${postId}/view`, { method: "POST" });
  } catch {
    // fire-and-forget
  }
}

export async function submitReport(
  postId: number,
  reason: string,
  fingerprint: string
): Promise<void> {
  const res = await fetch(`/api/posts/${postId}/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason, fingerprint }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || "举报失败");
  }
}

function getAdminToken(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("admin_token") ?? "";
}

export function setAdminToken(token: string): void {
  sessionStorage.setItem("admin_token", token);
}

export function clearAdminToken(): void {
  sessionStorage.removeItem("admin_token");
  sessionStorage.removeItem("admin_role");
}

export function hasAdminToken(): boolean {
  return !!getAdminToken();
}

export function setAdminRole(role: string): void {
  sessionStorage.setItem("admin_role", role);
}

export function getAdminRole(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("admin_role") ?? "";
}

export function isSuperAdmin(): boolean {
  return getAdminRole() === "super_admin";
}

async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getAdminToken();
  const res = await fetch(`${getBackendBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
    },
  });
  if (res.status === 401 || res.status === 403) {
    clearAdminToken();
    throw new Error("管理员认证失败");
  }
  return res;
}

export async function adminLogin(token: string): Promise<{ ok: boolean; role?: string }> {
  const res = await fetch(`${getBackendBaseUrl()}/api/admin/login`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { ok: false };
  const data = await res.json();
  return { ok: true, role: data.role };
}

export async function adminFetchUsers(): Promise<{ id: number; fingerprint: string; role: string; created_at: string }[]> {
  const res = await adminFetch("/api/admin/users");
  if (!res.ok) throw new Error("加载失败");
  return res.json();
}

export async function adminAddUser(fingerprint: string): Promise<void> {
  const res = await adminFetch("/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fingerprint }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || "添加失败");
  }
}

export async function adminRemoveUser(fingerprint: string): Promise<void> {
  const res = await adminFetch(`/api/admin/users/${encodeURIComponent(fingerprint)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || "移除失败");
  }
}

export async function adminSetTicketStatus(postId: number, ticketStatus: string): Promise<void> {
  const res = await adminFetch(`/api/admin/posts/${postId}/ticket-status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticket_status: ticketStatus }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || "操作失败");
  }
}

export async function adminFetchPosts(status?: string): Promise<Post[]> {
  const params = status ? `?status=${status}` : "";
  const res = await adminFetch(`/api/admin/posts${params}`);
  if (!res.ok) throw new Error("加载失败");
  return res.json();
}

export async function adminActOnPost(postId: number, action: string): Promise<void> {
  const res = await adminFetch(`/api/admin/posts/${postId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw new Error("操作失败");
}

export async function adminFetchReports(resolved?: boolean): Promise<Report[]> {
  const params = resolved !== undefined ? `?resolved=${resolved}` : "";
  const res = await adminFetch(`/api/admin/reports${params}`);
  if (!res.ok) throw new Error("加载失败");
  return res.json();
}

export async function adminResolveReport(reportId: number, resolved: boolean): Promise<void> {
  const res = await adminFetch(`/api/admin/reports/${reportId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resolved }),
  });
  if (!res.ok) throw new Error("操作失败");
}

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;
const WEEK = 604800;
const MONTH = 2592000;
const YEAR = 31536000;

export function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const delta = Math.floor((now - then) / 1000);

  if (delta < 0) return "刚刚";
  if (delta < MINUTE) return "刚刚";
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)} 分钟前`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)} 小时前`;
  if (delta < 2 * DAY) return "昨天";
  if (delta < WEEK) return `${Math.floor(delta / DAY)} 天前`;
  if (delta < MONTH) return `${Math.floor(delta / WEEK)} 周前`;
  if (delta < YEAR) return `${Math.floor(delta / MONTH)} 个月前`;
  return `${Math.floor(delta / YEAR)} 年前`;
}
