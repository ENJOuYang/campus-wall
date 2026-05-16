"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import styles from "../auth.module.css";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();

  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!phone.trim() && !email.trim()) {
      setError("手机号和邮箱至少填写一个");
      return;
    }
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    setLoading(true);
    try {
      await register({
        username: username.trim(),
        nickname: nickname.trim(),
        password,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        invite_code: inviteCode.trim() || undefined,
      });
      router.push("/");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "注册失败";
      setError(msg.replace(/^"|"$/g, "").replace(/^.*detail":"?([^"]+)"?.*$/, "$1"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.main}>
      <div className={styles.card}>
        <h1 className={styles.h1}>注册</h1>
        <form onSubmit={handleSubmit}>
          {error && <p className={styles.error}>{error}</p>}

          <label className={styles.label}>
            用户名 <span className={styles.required}>*</span>
            <input
              className={styles.input}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="唯一，不可重复"
              required
              minLength={2}
              maxLength={50}
            />
          </label>

          <label className={styles.label}>
            昵称 <span className={styles.required}>*</span>
            <input
              className={styles.input}
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="可重复的显示名称"
              required
              maxLength={50}
            />
          </label>

          <label className={styles.label}>
            手机号
            <input
              className={styles.input}
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="选填（与邮箱至少填一个）"
              maxLength={20}
            />
          </label>

          <label className={styles.label}>
            邮箱
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="选填（与手机号至少填一个）"
              maxLength={120}
            />
          </label>

          <label className={styles.label}>
            密码 <span className={styles.required}>*</span>
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              required
              minLength={6}
              maxLength={128}
            />
          </label>

          <label className={styles.label}>
            确认密码 <span className={styles.required}>*</span>
            <input
              className={styles.input}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再次输入密码"
              required
              minLength={6}
              maxLength={128}
            />
          </label>

          <label className={styles.label}>
            邀请码
            <input
              className={styles.input}
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="无需填写"
              maxLength={16}
            />
          </label>

          <button className={styles.btn} type="submit" disabled={loading}>
            {loading ? "注册中…" : "注册"}
          </button>
        </form>

        <p className={styles.footer}>
          已有账号？{" "}
          <Link className={styles.link} href="/login">
            去登录
          </Link>
        </p>
        <Link className={styles.back} href="/">
          ← 返回首页
        </Link>
      </div>
    </main>
  );
}
