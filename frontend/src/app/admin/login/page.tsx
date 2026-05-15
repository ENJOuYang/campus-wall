"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminLogin, setAdminToken, setAdminRole } from "@/lib/posts";
import styles from "./page.module.css";

export default function AdminLoginPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setPending(true);
    setError(null);
    try {
      const result = await adminLogin(token.trim());
      if (result.ok) {
        setAdminToken(token.trim());
        if (result.role) setAdminRole(result.role);
        router.push("/admin");
      } else {
        setError("令牌无效");
      }
    } catch {
      setError("认证失败，请检查后端是否运行");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className={styles.main}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <h1 className={styles.title}>管理员登录</h1>
        <p className={styles.desc}>请输入 ADMIN_TOKEN 以进入管理后台。</p>
        <input
          className={styles.input}
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="管理员令牌"
          autoFocus
          required
        />
        <button className={styles.submit} type="submit" disabled={pending}>
          {pending ? "验证中…" : "登录"}
        </button>
        {error ? <p className={styles.error}>{error}</p> : null}
      </form>
    </main>
  );
}
