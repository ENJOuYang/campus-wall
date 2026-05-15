"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import styles from "../auth.module.css";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(account.trim(), password);
      router.push("/");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "登录失败";
      setError(msg.replace(/^"|"$/g, "").replace(/^.*detail":"?([^"]+)"?.*$/, "$1"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.main}>
      <div className={styles.card}>
        <h1 className={styles.h1}>登录</h1>
        <form onSubmit={handleSubmit}>
          {error && <p className={styles.error}>{error}</p>}

          <label className={styles.label}>
            用户名 / 手机号 / 邮箱
            <input
              className={styles.input}
              type="text"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="输入用户名、手机号或邮箱"
              required
            />
          </label>

          <label className={styles.label}>
            密码
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="输入密码"
              required
            />
          </label>

          <button className={styles.btn} type="submit" disabled={loading}>
            {loading ? "登录中…" : "登录"}
          </button>
        </form>

        <p className={styles.footer}>
          还没有账号？{" "}
          <Link className={styles.link} href="/register">
            去注册
          </Link>
        </p>
        <Link className={styles.back} href="/">
          ← 返回首页
        </Link>
      </div>
    </main>
  );
}
