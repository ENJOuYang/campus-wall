"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Post } from "@/lib/posts";
import { deletePost, fetchPostById, formatRelativeTime, incrementView } from "@/lib/posts";
import { categoryLabel, ticketStatusLabel } from "@/lib/categories";
import { getFingerprint } from "@/lib/fingerprint";
import { useAuth } from "@/lib/auth-context";
import { LikeButton } from "@/components/LikeButton";
import { CommentSection } from "@/components/CommentSection";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { ReportModal } from "@/components/ReportModal";
import styles from "./page.module.css";

export default function PostDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = parseInt(String(params.id), 10);
  const { user } = useAuth();

  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewCount, setViewCount] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isOwner = !!(user && post?.author && user.username === post.author.username);

  const handleDelete = async () => {
    if (!confirm("确定删除这条帖子吗？此操作不可撤销。")) return;
    setDeleting(true);
    try {
      await deletePost(id);
      router.push("/");
    } catch (e) {
      alert(e instanceof Error ? e.message : "删除失败");
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (isNaN(id)) {
      setError("无效的帖子 ID。");
      setLoading(false);
      return;
    }

    let cancelled = false;
    const fp = getFingerprint();

    (async () => {
      try {
        const data = await fetchPostById(id, fp);
        if (cancelled) return;
        setPost(data);
        setViewCount(data.view_count);
        incrementView(id).then(() => {
          if (!cancelled) setViewCount((prev) => prev + 1);
        });
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <main className={styles.main}>
        <Link className={styles.backLink} href="/">← 返回首页</Link>
        <div className={styles.card}>
          <div className={styles.skeleton} style={{ width: "60%" }} />
          <div className={styles.skeleton} style={{ width: "30%", height: "0.7rem" }} />
          <div className={styles.skeleton} style={{ width: "100%" }} />
          <div className={styles.skeleton} style={{ width: "100%" }} />
          <div className={styles.skeleton} style={{ width: "70%" }} />
        </div>
      </main>
    );
  }

  if (error || !post) {
    return (
      <main className={styles.main}>
        <p className={styles.error}>{error ?? "帖子不存在"}</p>
        <div className={styles.footer}>
          <Link className={styles.backLink} href="/">← 返回首页</Link>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <Link className={styles.backLink} href="/">← 返回首页</Link>

      <article className={styles.card}>
        <div className={styles.head}>
          <span>#{post.id}</span>
          <span className={styles.badge}>{categoryLabel(post.category)}</span>
          {post.author && <Link href={`/user/${post.author.username}`} className={styles.authorBy}>{post.author.nickname || post.author.username}</Link>}
          {post.category === "ticket" && post.ticket_status && (
            <span className={`${styles.badge} ${styles.ticketBadge}`}>{ticketStatusLabel(post.ticket_status)}</span>
          )}
          <time dateTime={post.created_at}>{formatRelativeTime(post.created_at)}</time>
          <span className={styles.stat}>{viewCount} 次浏览</span>
        </div>

        <h1 className={styles.title}>{post.title}</h1>
        <MarkdownRenderer content={post.body} />

        {post.image_urls.length > 0 && (
          <div className={styles.imageGallery}>
            {post.image_urls.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`附件图片 ${i + 1}`}
                className={styles.detailImage}
              />
            ))}
          </div>
        )}
      </article>

      <div className={styles.actions}>
        <LikeButton postId={post.id} initialCount={post.like_count} initialLiked={post.is_liked} />
        {isOwner && (
          <button className={styles.reportBtn} onClick={handleDelete} disabled={deleting}>
            {deleting ? "删除中..." : "删除"}
          </button>
        )}
        <button className={styles.reportBtn} onClick={() => setReportOpen(true)}>
          举报
        </button>
      </div>

      <CommentSection postId={post.id} />

      <div className={styles.footer}>
        <Link className={styles.backLink} href="/">← 返回首页</Link>
      </div>

      <ReportModal postId={post.id} open={reportOpen} onClose={() => setReportOpen(false)} />
    </main>
  );
}
