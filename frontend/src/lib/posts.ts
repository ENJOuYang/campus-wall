export type Post = {
  id: number;
  title: string;
  body: string;
  category: string;
  created_at: string;
};

export type PostListResponse = {
  items: Post[];
  total: number;
};

/** 服务端直连 FastAPI（不走 Next rewrites），用于 RSC / Server Actions。 */
export function getBackendBaseUrl(): string {
  return process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
}

export async function fetchPostList(): Promise<PostListResponse> {
  const res = await fetch(`${getBackendBaseUrl()}/api/posts`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`加载帖子失败：HTTP ${res.status}`);
  }
  return (await res.json()) as PostListResponse;
}
