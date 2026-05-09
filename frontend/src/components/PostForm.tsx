"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * 无样式表单骨架：你可整段替换为自家组件库 / 设计稿实现。
 * 通过同源 `/api/posts` 提交，由 next.config rewrites 转到 FastAPI。
 */
export function PostForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      aria-label="发帖"
      onSubmit={async (e) => {
        e.preventDefault();
        setMessage(null);
        const form = e.currentTarget;
        const fd = new FormData(form);
        const title = String(fd.get("title") ?? "").trim();
        const body = String(fd.get("body") ?? "").trim();
        const category = String(fd.get("category") ?? "general");
        if (!title || !body) {
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
          router.refresh();
        } catch (err) {
          setMessage(err instanceof Error ? err.message : "发布失败");
        } finally {
          setPending(false);
        }
      }}
    >
      <fieldset>
        <legend>发帖（骨架）</legend>
        <div>
          <label htmlFor="cw-title">标题</label>
          <input id="cw-title" name="title" type="text" maxLength={200} required />
        </div>
        <div>
          <label htmlFor="cw-category">分类</label>
          <select id="cw-category" name="category" defaultValue="general">
            <option value="general">综合</option>
            <option value="lost">失物招领</option>
            <option value="confession">表白</option>
            <option value="rant">吐槽</option>
          </select>
        </div>
        <div>
          <label htmlFor="cw-body">正文</label>
          <textarea id="cw-body" name="body" maxLength={10000} required rows={6} />
        </div>
        <button type="submit" disabled={pending}>
          {pending ? "提交中…" : "发布"}
        </button>
        {message ? <p role="status">{message}</p> : null}
      </fieldset>
    </form>
  );
}
