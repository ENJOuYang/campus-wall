"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Comment } from "@/lib/posts";
import { createComment, fetchComments, formatRelativeTime } from "@/lib/posts";
import { getFingerprint } from "@/lib/fingerprint";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import styles from "./CommentSection.module.css";

type Props = {
  postId: number;
};

export function CommentSection({ postId }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fingerprint = useRef(getFingerprint());

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchComments(postId);
      setComments(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载评论失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [postId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setPending(true);
    setMsg(null);
    try {
      const comment = await createComment(postId, text, fingerprint.current);
      setComments((prev) => [...prev, comment]);
      setBody("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "评论失败");
    } finally {
      setPending(false);
    }
  };

  return (
    <section className={styles.section}>
      <h3 className={styles.title}>评论 ({comments.length})</h3>

      <form className={styles.form} onSubmit={handleSubmit}>
        <textarea
          className={styles.textarea}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="写下你的评论…（支持 Markdown）"
          maxLength={2000}
          rows={3}
          required
        />
        <button className={styles.submit} type="submit" disabled={pending || !body.trim()}>
          {pending ? "提交中…" : "发表评论"}
        </button>
        {msg ? <p className={styles.msg}>{msg}</p> : null}
      </form>

      {loading ? (
        <p className={styles.loading}>加载评论中…</p>
      ) : error ? (
        <p className={styles.error}>{error}</p>
      ) : comments.length === 0 ? (
        <p className={styles.empty}>暂无评论，来发表第一条吧。</p>
      ) : (
        <ul className={styles.list}>
          {comments.map((c) => (
            <li key={c.id} className={styles.item}>
              <div className={styles.commentHead}>
                <span className={styles.author}>{c.author ? <Link href={`/user/${c.author.username}`} className={styles.authorLink}>{c.author.nickname || c.author.username}</Link> : "匿名用户"}</span>
                <time dateTime={c.created_at} className={styles.time}>
                  {formatRelativeTime(c.created_at)}
                </time>
              </div>
              <MarkdownRenderer content={c.body} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
