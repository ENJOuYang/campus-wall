"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./PostForm.module.css";

export function PostForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  return (
    <div className={styles.wrap}>
      <form
        className={styles.card}
        aria-label="发帖"
        onSubmit={async (e) => {
          e.preventDefault();
          setMessage(null);
          setIsError(false);
          const form = e.currentTarget;
          const fd = new FormData(form);
          const title = String(fd.get("title") ?? "").trim();
          const body = String(fd.get("body") ?? "").trim();
          const category = String(fd.get("category") ?? "casual");
          if (!title || !body) {
            setIsError(true);
            setMessage("请填写标题与正文。");
            return;
          }
          setPending(true);
          try {
            const res = await fetch("/api/posts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title, body, category }),
            });
            if (!res.ok) {
              const t = await res.text();
              throw new Error(t || `HTTP ${res.status}`);
            }
            form.reset();
            setMessage("已发布");
            router.refresh();
          } catch (err) {
            setIsError(true);
            setMessage(err instanceof Error ? err.message : "发布失败");
          } finally {
            setPending(false);
          }
        }}
      >
        <h2 className={styles.title}>发帖</h2>
        <div className={styles.row}>
          <label htmlFor="cw-title">标题</label>
          <input id="cw-title" name="title" type="text" maxLength={200} required />
        </div>
        <div className={styles.row}>
          <label htmlFor="cw-category">分区</label>
          <select id="cw-category" name="category" defaultValue="casual">
            <option value="casual">日常灌水</option>
            <option value="study">学习·文化课</option>
            <option value="notice">公告</option>
            <option value="ticket">工单</option>
          </select>
        </div>
        <div className={styles.row}>
          <label htmlFor="cw-body">正文</label>
          <textarea id="cw-body" name="body" maxLength={10000} required rows={6} />
        </div>
        <button className={styles.submit} type="submit" disabled={pending}>
          {pending ? "提交中…" : "发布"}
        </button>
        {message ? (
          <p className={`${styles.msg} ${isError ? styles.msgError : ""}`} role="status">
            {message}
          </p>
        ) : null}
      </form>
    </div>
  );
}
