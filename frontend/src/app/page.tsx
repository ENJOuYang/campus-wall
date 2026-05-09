import { PostForm } from "@/components/PostForm";
import { fetchPostList } from "@/lib/posts";

export const dynamic = "force-dynamic";

/**
 * 首页：服务端拉列表（SSR 数据获取），发帖区为 Client Component。
 * 结构尽量语义化、无装饰类名，方便你套自己的 UI。
 */
export default async function HomePage() {
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

  return (
    <main>
      <header>
        <h1>校园墙</h1>
        <p>后端请先运行在 8000；本页为 Next.js 渲染骨架，样式由你自行设计。</p>
      </header>

      <PostForm />

      <section aria-label="帖子列表">
        <h2>帖子</h2>
        {loadError ? <p role="alert">{loadError}</p> : null}
        {!loadError && items.length === 0 ? <p>暂无帖子。</p> : null}
        {!loadError && items.length > 0 ? (
          <p>
            共 <strong>{total}</strong> 条（本页展示前 {items.length} 条）
          </p>
        ) : null}
        <ul>
          {items.map((p) => (
            <li key={p.id}>
              <article>
                <header>
                  <span>#{p.id}</span>
                  <span>{p.category}</span>
                  <time dateTime={p.created_at}>{new Date(p.created_at).toLocaleString()}</time>
                </header>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </article>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
