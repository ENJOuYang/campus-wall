import type { Post } from "@/lib/posts";

export type PostCategorySlug = "casual" | "study" | "domestic" | "international" | "help" | "notice" | "ticket";

export type NavTabSlug = "all" | "hot" | PostCategorySlug;

export const NAV_TABS: { slug: NavTabSlug; label: string; href: string }[] = [
  { slug: "all", label: "全部", href: "/" },
  { slug: "hot", label: "热门", href: "/?tab=hot" },
  { slug: "casual", label: "闲话", href: "/?tab=casual" },
  { slug: "study", label: "学习·文化课", href: "/?tab=study" },
  { slug: "domestic", label: "国内部", href: "/?tab=domestic" },
  { slug: "international", label: "国际部", href: "/?tab=international" },
  { slug: "help", label: "求助", href: "/?tab=help" },
  { slug: "notice", label: "公告", href: "/?tab=notice" },
  { slug: "ticket", label: "工单", href: "/?tab=ticket" },
];

const LABELS: Record<string, string> = {
  casual: "闲话",
  study: "学习·文化课",
  domestic: "国内部",
  international: "国际部",
  help: "求助",
  notice: "公告",
  ticket: "工单",
  general: "综合",
};

export function parseTab(raw: string | string[] | undefined): NavTabSlug {
  const v = typeof raw === "string" ? raw : raw?.[0];
  const allowed: NavTabSlug[] = ["all", "hot", "casual", "study", "domestic", "international", "help", "notice", "ticket"];
  if (v && allowed.includes(v as NavTabSlug)) return v as NavTabSlug;
  return "all";
}

export function categoryLabel(slug: string): string {
  return LABELS[slug] ?? slug;
}

export function filterPostsByTab(items: Post[], tab: NavTabSlug): Post[] {
  if (tab === "all" || tab === "hot") return items;
  return items.filter((p) => p.category === tab);
}

const TICKET_STATUS_LABELS: Record<string, string> = {
  open: "待处理",
  processing: "处理中",
  completed: "已完成",
  closed: "已关闭",
};

export function ticketStatusLabel(status: string | null): string {
  if (!status) return "待处理";
  return TICKET_STATUS_LABELS[status] ?? status;
}
