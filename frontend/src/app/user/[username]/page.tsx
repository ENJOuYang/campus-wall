"use client";

import Link from "next/link";
import { useParams, notFound } from "next/navigation";
import { useEffect, useState } from "react";
import { categoryLabel } from "@/lib/categories";
import { formatRelativeTime, getBackendBaseUrl } from "@/lib/posts";
import styles from "./page.module.css";

type PostItem = {
  id: number;
  title: string;
  category: string;
  created_at: string;
  view_count: number;
  like_count: number;
};

type ProfileData = {
  id: number;
  username: string;
  nickname: string;
  created_at: string;
  post_count: number;
  posts: PostItem[];
};

export default function UserProfilePage() {
  const params = useParams();
  const username = String(params.username);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const url = `${getBackendBaseUrl()}/api/auth/users/${encodeURIComponent(username)}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) { setError("用户不存在"); return; }
        setProfile(await res.json());
      } catch {
        setError("加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [username]);

  if (loading) return <main className={styles.main}><p className={styles.empty}>加载中…</p></main>;
  if (error || !profile) return <main className={styles.main}><p className={styles.empty}>{error ?? "用户不存在"}</p></main>;

  return (
    <main className={styles.main}>
      <Link className={styles.backLink} href="/">← 返回首页</Link>

      <div className={styles.card}>
        <div className={styles.avatar}>
          {profile.nickname.charAt(0).toUpperCase()}
        </div>
        <h1 className={styles.nickname}>{profile.nickname}</h1>
        <p className={styles.username}>@{profile.username}</p>
        <div className={styles.meta}>
          <span>{profile.post_count} 篇帖子</span>
          <span>·</span>
          <span>{formatRelativeTime(profile.created_at)} 加入</span>
        </div>
      </div>

      <h2 className={styles.sectionTitle}>最近帖子</h2>

      {profile.posts.length === 0 ? (
        <p className={styles.empty}>暂无帖子</p>
      ) : (
        <ul className={styles.postList}>
          {profile.posts.map((p) => (
            <li key={p.id}>
              <Link href={`/post/${p.id}`} className={styles.postItem}>
                <div className={styles.postHead}>
                  <span className={styles.postBadge}>{categoryLabel(p.category)}</span>
                  <time dateTime={p.created_at}>{formatRelativeTime(p.created_at)}</time>
                </div>
                <h3 className={styles.postTitle}>{p.title}</h3>
                <div className={styles.postStats}>
                  <span>{p.view_count} 浏览</span>
                  <span>{p.like_count} 赞</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
