import { PostForm } from "@/components/PostForm";
import { NAV_TABS, categoryLabel, filterPostsByTab, parseTab } from "@/lib/categories";
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
    const data = await fetchPostList();
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
            ? "热门区暂按发布时间排序；接入点赞或浏览量后可改为热度排序。"
            : "黑白简约布局，分区与发帖分类一致。在「globals.css」里可整体换色与对比度。"}
        </p>
      </section>

      <PostForm />

      <div className={styles.inner}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>本区帖子</h2>
          {!loadError ? (
            <p className={styles.meta}>
              全站 {total} 条 · 本页 {visible.length} 条
            </p>
          ) : null}
        </div>
        {loadError ? (
          <p className={styles.alert} role="alert">
            {loadError}
          </p>
        ) : null}
        {!loadError && visible.length === 0 ? <p className={styles.empty}>该分区暂无帖子。</p> : null}
        {!loadError && visible.length > 0 ? (
          <ul className={styles.list}>
            {visible.map((p) => (
              <li key={p.id}>
                <article className={styles.card}>
                  <div className={styles.cardHead}>
                    <span>#{p.id}</span>
                    <span className={styles.badge}>{categoryLabel(p.category)}</span>
                    <time dateTime={p.created_at}>{new Date(p.created_at).toLocaleString()}</time>
                  </div>
                  <h3 className={styles.cardTitle}>{p.title}</h3>
                  <p className={styles.cardBody}>{p.body}</p>
                </article>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </main>
  );
}
