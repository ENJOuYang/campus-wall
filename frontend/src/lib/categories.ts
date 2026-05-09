import type { Post } from "@/lib/posts";

/** 与顶栏 Tab 对应的帖子分类 slug（写入 FastAPI `category` 字段） */
export type PostCategorySlug = "casual" | "study" | "notice" | "ticket";

export type NavTabSlug = "all" | "hot" | PostCategorySlug;

export const NAV_TABS: { slug: NavTabSlug; label: string; href: string }[] = [
  { slug: "all", label: "全部", href: "/" },
  { slug: "hot", label: "热门", href: "/?tab=hot" },
  { slug: "casual", label: "日常灌水", href: "/?tab=casual" },
  { slug: "study", label: "学习·文化课", href: "/?tab=study" },
  { slug: "notice", label: "公告", href: "/?tab=notice" },
  { slug: "ticket", label: "工单", href: "/?tab=ticket" },
];

const LABELS: Record<string, string> = {
  casual: "日常灌水",
  study: "学习·文化课",
  notice: "公告",
  ticket: "工单",
  general: "综合",
  lost: "失物招领",
  confession: "表白",
  rant: "吐槽",
};

export function parseTab(raw: string | string[] | undefined): NavTabSlug {
  const v = typeof raw === "string" ? raw : raw?.[0];
  const allowed: NavTabSlug[] = ["all", "hot", "casual", "study", "notice", "ticket"];
  if (v && allowed.includes(v as NavTabSlug)) return v as NavTabSlug;
  return "all";
}

export function categoryLabel(slug: string): string {
  return LABELS[slug] ?? slug;
}

export function filterPostsByTab(items: Post[], tab: NavTabSlug): Post[] {
  if (tab === "all") return items;
  if (tab === "hot") {
    return [...items].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
  return items.filter((p) => p.category === tab);
}
