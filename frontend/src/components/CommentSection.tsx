"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Comment } from "@/lib/posts";
import { createComment, deleteComment, fetchComments, formatRelativeTime } from "@/lib/posts";
import { getStoredToken } from "@/lib/auth";
import { useAuth } from "@/lib/auth-context";
import { getFingerprint } from "@/lib/fingerprint";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { LikeButton } from "./LikeButton";
import styles from "./CommentSection.module.css";

type Props = {
  postId: number;
};

function insertReplyToTree(comments: Comment[], parentId: number, reply: Comment): Comment[] {
  return comments.map((c) => {
    if (c.id === parentId) {
      return { ...c, replies: [...(c.replies || []), reply] };
    }
    if (c.replies && c.replies.length > 0) {
      return { ...c, replies: insertReplyToTree(c.replies, parentId, reply) };
    }
    return c;
  });
}

function CommentItem({
  comment,
  postId,
  onReply,
  replyingTo,
  onCancelReply,
  onReplySubmit,
  replyBody,
  onReplyBodyChange,
  replyPending,
  onDelete,
  currentUsername,
  depth = 0,
}: {
  comment: Comment;
  postId: number;
  onReply: (id: number) => void;
  replyingTo: number | null;
  onCancelReply: () => void;
  onReplySubmit: (parentId: number, text: string) => void;
  replyBody: string;
  onReplyBodyChange: (v: string) => void;
  replyPending: boolean;
  onDelete: (commentId: number) => void;
  currentUsername: string | null;
  depth?: number;
}) {
  const isCommentOwner = !!(currentUsername && comment.author && comment.author.username === currentUsername);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onReplySubmit(comment.id, replyBody.trim());
  };

  return (
    <li className={`${styles.item} ${depth > 0 ? styles.replyItem : ""}`}>
      <div className={styles.commentHead}>
        <span className={styles.author}>
          {comment.author ? (
            <Link href={`/user/${comment.author.username}`} className={styles.authorLink}>
              {comment.author.nickname || comment.author.username}
            </Link>
          ) : (
            "匿名用户"
          )}
        </span>
        <time dateTime={comment.created_at} className={styles.time}>
          {formatRelativeTime(comment.created_at)}
        </time>
      </div>

      <div className={styles.commentBody}>
        <MarkdownRenderer content={comment.body} />
      </div>

      <div className={styles.commentActions}>
        <LikeButton
          postId={postId}
          commentId={comment.id}
          initialCount={comment.like_count}
          initialLiked={comment.is_liked}
        />
        <button className={styles.replyBtn} onClick={() => onReply(comment.id)}>
          回复
        </button>
        {isCommentOwner && (
          <button className={styles.deleteBtn} onClick={() => { if (confirm("确定删除这条评论吗？")) onDelete(comment.id); }}>
            删除
          </button>
        )}
      </div>

      {replyingTo === comment.id && (
        <form className={styles.replyForm} onSubmit={handleSubmit}>
          <textarea
            className={styles.replyInput}
            value={replyBody}
            onChange={(e) => onReplyBodyChange(e.target.value)}
            placeholder="写下你的回复...（支持 Markdown）"
            maxLength={2000}
            rows={2}
          />
          <div className={styles.replyFormActions}>
            <button type="submit" className={styles.replySubmit} disabled={!replyBody.trim() || replyPending}>
              {replyPending ? "发送中..." : "回复"}
            </button>
            <button type="button" className={styles.replyCancel} onClick={onCancelReply}>
              取消
            </button>
          </div>
        </form>
      )}

      {comment.replies && comment.replies.length > 0 && (
        <ul className={styles.replyList}>
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              postId={postId}
              onReply={onReply}
              replyingTo={replyingTo}
              onCancelReply={onCancelReply}
              onReplySubmit={onReplySubmit}
              replyBody={replyBody}
              onReplyBodyChange={onReplyBodyChange}
              replyPending={replyPending}
              onDelete={onDelete}
              currentUsername={currentUsername}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function CommentSection({ postId }: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replyPending, setReplyPending] = useState(false);

  const fingerprint = useRef(getFingerprint());

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchComments(postId, fingerprint.current);
      setComments(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载评论失败");
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setPending(true);
    setMsg(null);
    try {
      const comment = await createComment(postId, text, fingerprint.current);
      setComments((prev) => [...prev, { ...comment, replies: [], like_count: 0, is_liked: false }]);
      setBody("");
      setMsg("评论发表成功");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "评论失败");
    } finally {
      setPending(false);
    }
  };

  const handleReplySubmit = async (parentId: number, text: string) => {
    if (!text) return;
    setReplyPending(true);
    try {
      const comment = await createComment(postId, text, fingerprint.current, parentId);
      setComments((prev) =>
        insertReplyToTree(prev, parentId, { ...comment, replies: [], like_count: 0, is_liked: false })
      );
      setReplyBody("");
      setReplyingTo(null);
    } catch {
      // silently fail, user can retry
    } finally {
      setReplyPending(false);
    }
  };

  const handleDelete = async (commentId: number) => {
    try {
      await deleteComment(postId, commentId);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "删除失败");
    }
  };

  if (loading) return <p className={styles.loading}>加载评论中...</p>;
  if (error) return <p className={styles.error}>{error}</p>;

  const isLoggedIn = !!getStoredToken();

  return (
    <section className={styles.section}>
      <h3 className={styles.title}>评论 ({comments.length})</h3>

      {isLoggedIn ? (
        <form className={styles.form} onSubmit={handleSubmit}>
          <textarea
            className={styles.textarea}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="写下你的评论...（支持 Markdown）"
            maxLength={2000}
            rows={3}
            required
          />
          <button className={styles.submit} type="submit" disabled={pending || !body.trim()}>
            {pending ? "提交中..." : "发表评论"}
          </button>
          {msg ? (
            <p className={`${styles.msg} ${msg.includes("失败") ? styles.msgErr : ""}`}>
              {msg}
            </p>
          ) : null}
        </form>
      ) : (
        <p className={styles.loading}>请登录后发表评论</p>
      )}

      {comments.length === 0 ? (
        <p className={styles.empty}>暂无评论，来发表第一条吧。</p>
      ) : (
        <ul className={styles.list}>
          {comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              postId={postId}
              onReply={(id) => {
                setReplyingTo(id);
                setReplyBody("");
              }}
              replyingTo={replyingTo}
              onCancelReply={() => {
                setReplyingTo(null);
                setReplyBody("");
              }}
              onReplySubmit={handleReplySubmit}
              replyBody={replyBody}
              onReplyBodyChange={setReplyBody}
              replyPending={replyPending}
              onDelete={handleDelete}
              currentUsername={user?.username ?? null}
              depth={0}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
