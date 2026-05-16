"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Post } from "@/lib/posts";
import { fetchPostList, formatRelativeTime } from "@/lib/posts";
import { categoryLabel, filterPostsByTab, type NavTabSlug } from "@/lib/categories";
import { useSearch } from "@/lib/search-context";
import { getFingerprint } from "@/lib/fingerprint";
import { LikeButton } from "./LikeButton";
import { PostListSkeleton } from "./PostListSkeleton";
import styles from "./PostList.module.css";

const PAGE_SIZE = 20;

const EMPTY_MESSAGES: Record<string, string> = {
  all: "还没有帖子，来发第一帖吧。",
  hot: "暂无热门帖子。",
  casual: "暂无闲话，来聊聊吧。",
  study: "暂无学习帖，来分享知识吧。",
  domestic: "暂无国内部帖子。",
  international: "暂无国际部帖子。",
  help: "暂无求助帖。",
  notice: "暂无公告。",
  ticket: "暂无工单，有需求就来提。",
};

type Props = {
  initialItems: Post[];
  initialTotal: number;
  tab: NavTabSlug;
};

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s/g, "")
    .replace(/(\*{1,3}|_{1,3}|~{2})(.*?)\1/g, "$2")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "[图片]")
    .replace(/^[-*+]\s/gm, "")
    .replace(/^\d+\.\s/gm, "")
    .replace(/^>\s/gm, "")
    .replace(/[-*_~]/g, "")
    .replace(/\n{2,}/g, " ")
    .replace(/\n/g, " ")
    .substring(0, 200);
}

export function PostList({ initialItems, initialTotal, tab }: Props) {
  const [allItems, setAllItems] = useState<Post[]>(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const loadingRef = useRef(false);
  const fp = useRef(getFingerprint());
  const { query } = useSearch();

  const tabFiltered = useMemo(() => filterPostsByTab(allItems, tab), [allItems, tab]);
  const visible = tabFiltered;

  const catParam = useMemo(() => (tab !== "all" && tab !== "hot") ? tab : "", [tab]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const sort = tab === "hot" ? "hot" : "latest";
      const data = await fetchPostList(allItems.length, PAGE_SIZE, sort, fp.current, catParam, query);
      setAllItems((prev) => [...prev, ...data.items]);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [allItems.length, tab, catParam, query]);

  // Refresh with fingerprint on mount so likes persist across page loads
  useEffect(() => {
    const refresh = async () => {
      try {
        const sort = tab === "hot" ? "hot" : "latest";
        const data = await fetchPostList(0, initialItems.length || PAGE_SIZE, sort, fp.current, catParam, query);
        setAllItems(data.items);
        setTotal(data.total);
      } catch {
        // keep initial data on error
      }
    };
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Server-side search: refetch when query changes
  useEffect(() => {
    let cancelled = false;
    const doSearch = async () => {
      setSearching(true);
      setError(null);
      try {
        const sort = tab === "hot" ? "hot" : "latest";
        const data = await fetchPostList(0, PAGE_SIZE, sort, fp.current, catParam, query);
        if (cancelled) return;
        setAllItems(data.items);
        setTotal(data.total);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "搜索失败");
      } finally {
        if (!cancelled) setSearching(false);
      }
    };
    doSearch();
    return () => { cancelled = true; };
  }, [query, tab, catParam]);

  useEffect(() => {
    setAllItems(initialItems);
    setTotal(initialTotal);
    setError(null);
  }, [initialItems, initialTotal]);

  if (visible.length === 0) {
    const message = query.trim()
      ? `没有找到包含"${query}"的帖子`
      : EMPTY_MESSAGES[tab] ?? "该分区暂无帖子。";
    return <p className={styles.empty}>{message}</p>;
  }

  return (
    <>
      <ul className={styles.list}>
        {visible.map((p) => (
          <li key={p.id} className={styles.listItem}>
            <Link href={`/post/${p.id}`} className={styles.card}>
              <div className={styles.cardHead}>
                <span>#{p.id}</span>
                <span className={styles.badge}>{categoryLabel(p.category)}</span>
                {p.author && <Link href={`/user/${p.author.username}`} className={styles.author} onClick={(e) => e.stopPropagation()}>{p.author.nickname || p.author.username}</Link>}
                <time dateTime={p.created_at}>{formatRelativeTime(p.created_at)}</time>
                <span className={styles.stat}>{p.view_count} 次浏览</span>
                <span className={styles.stat}>{p.like_count} 赞</span>
              </div>
              <h3 className={styles.cardTitle}>{p.title}</h3>
              <p className={styles.cardBody}>{stripMarkdown(p.body)}</p>
              {p.image_urls.length > 0 && (
                <div className={styles.cardThumbs}>
                  {p.image_urls.slice(0, 3).map((url, i) => (
                    <img key={i} src={url} alt={`图片 ${i + 1}`} className={styles.cardThumb} />
                  ))}
                  {p.image_urls.length > 3 && (
                    <span className={styles.moreImages}>+{p.image_urls.length - 3}</span>
                  )}
                </div>
              )}
            </Link>
            <div className={styles.cardActions}>
              <LikeButton postId={p.id} initialCount={p.like_count} initialLiked={p.is_liked} />
            </div>
          </li>
        ))}
      </ul>

      {error ? (
        <div className={styles.loadMore}>
          <p className={styles.loadMoreInfo} style={{ color: "var(--fg)" }}>{error}</p>
          <button className={styles.loadMoreBtn} onClick={loadMore}>重试</button>
        </div>
      ) : allItems.length < total && !query.trim() ? (
        <div className={styles.loadMore}>
          <button className={styles.loadMoreBtn} onClick={loadMore} disabled={loading}>
            {loading ? "加载中…" : "加载更多"}
          </button>
          <p className={styles.loadMoreInfo}>
            已加载 {allItems.length} / {total} 条
          </p>
        </div>
      ) : null}

      {loading ? <PostListSkeleton count={3} /> : null}
    </>
  );
}
