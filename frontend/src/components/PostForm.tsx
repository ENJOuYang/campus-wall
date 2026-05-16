"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { hasAdminToken, uploadImage } from "@/lib/posts";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import styles from "./PostForm.module.css";

function getAdminToken(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("admin_token") ?? "";
}

function getUserToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("cw_token") ?? "";
}

function isLoggedIn(): boolean {
  return !!getUserToken() || !!getAdminToken();
}

export function PostForm() {
  const router = useRouter();
  const isAdmin = hasAdminToken();
  const loggedIn = isLoggedIn();
  const [pending, setPending] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [bodyText, setBodyText] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fsTextareaRef = useRef<HTMLTextAreaElement>(null);
  const previewsRef = useRef<string[]>([]);

  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current);
      previewsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const handleAddFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const incoming = Array.from(fileList);
    setSelectedFiles((prev) => {
      const merged = [...prev];
      for (const f of incoming) {
        if (merged.length >= 9) break;
        merged.push(f);
      }
      return merged;
    });
    setPreviews((prev) => {
      const merged = [...prev];
      for (const f of incoming) {
        if (merged.length >= 9) break;
        merged.push(URL.createObjectURL(f));
      }
      return merged;
    });
  };

  const removeFile = (index: number) => {
    URL.revokeObjectURL(previews[index]);
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  // Auto-sync fullscreen textarea to bodyText every 1s
  useEffect(() => {
    if (!fullscreen) return;
    const interval = setInterval(() => {
      if (fsTextareaRef.current) {
        setBodyText(fsTextareaRef.current.value);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [fullscreen]);

  const openFullscreen = useCallback(() => {
    setFullscreen(true);
    setTimeout(() => fsTextareaRef.current?.focus(), 100);
  }, []);

  const closeFullscreen = useCallback(() => {
    if (fsTextareaRef.current) {
      setBodyText(fsTextareaRef.current.value);
    }
    setFullscreen(false);
    setTimeout(() => textareaRef.current?.focus(), 100);
  }, []);

  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBodyText(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setIsError(false);
    clearTimeout(timerRef.current);
    const form = e.currentTarget as HTMLFormElement;
    const fd = new FormData(form);
    const title = String(fd.get("title") ?? "").trim();
    const body = fullscreen ? (fsTextareaRef.current?.value ?? bodyText).trim() : bodyText.trim();
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
      const token = getAdminToken() || getUserToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch("/api/posts", {
        method: "POST",
        headers,
        body: JSON.stringify({ title, body, category, image_urls: uploadedUrls, anonymous }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      form.reset();
      setBodyText("");
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
  };

  if (!loggedIn) {
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <h2 className={styles.title}>发帖</h2>
          <p className={styles.loginHint}>
            请先
            <Link href="/login" className={styles.loginLink}>登录</Link>
            或
            <Link href="/register" className={styles.loginLink}>注册</Link>
            后再发帖。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <form className={styles.card} aria-label="发帖" onSubmit={handleSubmit}>
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
          <div className={styles.bodyHeader}>
            <label htmlFor="cw-body">正文（支持 Markdown）</label>
            <div className={styles.bodyActions}>
              <button type="button" className={styles.actionBtn} onClick={() => setShowPreview((v) => !v)}>
                {showPreview ? "编辑" : "预览"}
              </button>
              <button type="button" className={styles.actionBtn} onClick={openFullscreen}>
                全屏
              </button>
            </div>
          </div>
          {showPreview ? (
            <div className={styles.previewPane}>
              {bodyText.trim() ? (
                <MarkdownRenderer content={bodyText} />
              ) : (
                <p className={styles.emptyPreview}>暂无内容</p>
              )}
            </div>
          ) : (
            <>
              <textarea
                ref={textareaRef}
                id="cw-body"
                name="body"
                maxLength={10000}
                required
                rows={6}
                value={bodyText}
                onChange={handleBodyChange}
              />
              <p className={styles.hint}>
                支持 **加粗** *斜体* `代码` [链接](url) ![图片](url) 表格 列表 引用 等
              </p>
            </>
          )}
        </div>
        <div className={styles.row}>
          <label htmlFor="cw-images">图片（可选，最多 9 张）</label>
          <input
            id="cw-images"
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleAddFiles(e.target.files)}
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
        {!isAdmin && (
          <div className={styles.row}>
            <label className={styles.checkLabel}>
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
              {" "}匿名发布
            </label>
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

      {/* Fullscreen markdown editor */}
      {fullscreen && (
        <div className={styles.fullscreenOverlay}>
          <div className={styles.fullscreenBar}>
            <span className={styles.fullscreenTitle}>Markdown 全屏编辑</span>
            <div className={styles.fullscreenActions}>
              <button type="button" className={styles.actionBtn} onClick={() => setShowPreview((v) => !v)}>
                {showPreview ? "编辑" : "预览"}
              </button>
              <button type="button" className={styles.actionBtn} onClick={closeFullscreen}>
                退出全屏
              </button>
            </div>
          </div>
          <div className={styles.fullscreenBody}>
            {showPreview ? (
              <div className={styles.fsPreviewPane}>
                <MarkdownRenderer content={fsTextareaRef.current?.value ?? bodyText} />
              </div>
            ) : (
              <textarea
                ref={fsTextareaRef}
                className={styles.fullscreenTextarea}
                defaultValue={bodyText}
                maxLength={10000}
                placeholder="支持 Markdown 语法…"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
