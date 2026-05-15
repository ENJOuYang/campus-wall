"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { hasAdminToken, uploadImage } from "@/lib/posts";

function getAdminToken(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("admin_token") ?? "";
}
import styles from "./PostForm.module.css";

export function PostForm() {
  const router = useRouter();
  const isAdmin = hasAdminToken();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current);
      previews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previews]);

  const handleFileChange = (files: FileList | null) => {
    if (!files) return;
    previews.forEach((url) => URL.revokeObjectURL(url));
    const fileArr = Array.from(files).slice(0, 9);
    setSelectedFiles(fileArr);
    setPreviews(fileArr.map((f) => URL.createObjectURL(f)));
  };

  const removeFile = (index: number) => {
    URL.revokeObjectURL(previews[index]);
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className={styles.wrap}>
      <form
        className={styles.card}
        aria-label="发帖"
        onSubmit={async (e) => {
          e.preventDefault();
          setMessage(null);
          setIsError(false);
          clearTimeout(timerRef.current);
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
            const uploadedUrls: string[] = [];
            for (const file of selectedFiles) {
              const url = await uploadImage(file);
              uploadedUrls.push(url);
            }
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            const token = getAdminToken();
            if (token) headers["Authorization"] = `Bearer ${token}`;
            const res = await fetch("/api/posts", {
              method: "POST",
              headers,
              body: JSON.stringify({ title, body, category, image_urls: uploadedUrls }),
            });
            if (!res.ok) {
              const t = await res.text();
              throw new Error(t || `HTTP ${res.status}`);
            }
            form.reset();
            previews.forEach((url) => URL.revokeObjectURL(url));
            setSelectedFiles([]);
            setPreviews([]);
            const data = await res.json();
            if (data.status === "pending") {
              setMessage("帖子已提交，等待管理员审核。");
            } else {
              setMessage("已发布");
            }
            setIsError(false);
            timerRef.current = setTimeout(() => setMessage(null), 3000);
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
            {isAdmin && <option value="notice">公告</option>}
            <option value="ticket">工单</option>
          </select>
        </div>
        <div className={styles.row}>
          <label htmlFor="cw-body">正文（支持 Markdown）</label>
          <textarea id="cw-body" name="body" maxLength={10000} required rows={6} />
          <p className={styles.hint}>
            支持 **加粗** *斜体* `代码` [链接](url) ![图片](url) 表格 列表 引用 等
          </p>
        </div>
        <div className={styles.row}>
          <label htmlFor="cw-images">图片（可选，最多 9 张）</label>
          <input
            id="cw-images"
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleFileChange(e.target.files)}
            className={styles.fileInput}
          />
        </div>
        {previews.length > 0 && (
          <div className={styles.previewArea}>
            {previews.map((url, i) => (
              <div key={i} className={styles.previewItem}>
                <img src={url} alt={`预览 ${i + 1}`} className={styles.previewThumb} />
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => removeFile(i)}
                  title="移除图片"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
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
