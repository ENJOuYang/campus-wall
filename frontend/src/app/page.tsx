import { Suspense } from "react";
import { PostFormToggle } from "@/components/PostFormToggle";
import { PostList } from "@/components/PostList";
import { PostListSkeleton } from "@/components/PostListSkeleton";
import { NAV_TABS, filterPostsByTab, parseTab, type NavTabSlug } from "@/lib/categories";
import { fetchPostList } from "@/lib/posts";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ tab?: string | string[] }>;
};

export default async function HomePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const tab = parseTab(sp.tab);

  let items: Awaited<ReturnType<typeof fetchPostList>>["items"] = [];
  let total = 0;
  let loadError: string | null = null;

  try {
    const sort = tab === "hot" ? "hot" : "latest";
    const category = (tab !== "all" && tab !== "hot") ? tab : "";
    const data = await fetchPostList(0, 20, sort, "", category);
    items = data.items;
    total = data.total;
  } catch (e) {
    loadError = e instanceof Error ? e.message : "无法加载帖子";
  }

  const visible = loadError ? [] : filterPostsByTab(items, tab);
  const tabLabel = NAV_TABS.find((t) => t.slug === tab)?.label ?? "全部";

  return (
    <main className={styles.main}>
      <section className={styles.hero} aria-labelledby="feed-title">
        <p className={styles.kicker}>Browsing</p>
        <h1 id="feed-title" className={styles.heroTitle}>
          {tabLabel}
        </h1>
        <p className={styles.heroDesc}>
          {tab === "hot"
            ? "按点赞数排序，最受欢迎的帖子优先展示。"
            : "DS 社区 · 分区与发帖分类一致。"}
        </p>
      </section>

      <PostFormToggle />

      <div className={styles.inner}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>本区帖子</h2>
          {!loadError ? (
            <p className={styles.meta}>
              全站 {total} 条 · 本区 {visible.length} 条
            </p>
          ) : null}
        </div>

        {loadError ? (
          <p className={styles.alert} role="alert">
            {loadError}
          </p>
        ) : (
          <Suspense fallback={<PostListSkeleton count={5} />}>
            <PostList initialItems={visible} initialTotal={total} tab={tab} />
          </Suspense>
        )}
      </div>
    </main>
  );
}
