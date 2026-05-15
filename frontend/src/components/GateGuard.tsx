"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import styles from "./gate.module.css";

const GATE_PASSED_KEY = "cw_gate_passed";

export function GateGuard({ children }: { children: ReactNode }) {
  const [passed, setPassed] = useState<boolean | null>(null);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setPassed(localStorage.getItem(GATE_PASSED_KEY) === "1");
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/auth/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      });
      if (res.ok) {
        localStorage.setItem(GATE_PASSED_KEY, "1");
        setPassed(true);
      } else {
        setError("答案不对，再想想～");
      }
    } catch {
      setError("网络错误，稍后重试");
    }
  };

  if (passed === null) return null;
  if (passed) return <>{children}</>;

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <h1 className={styles.title}>🚪 校园墙</h1>
        <p className={styles.question}>学校中餐套餐多少钱一份？</p>
        <form onSubmit={handleSubmit}>
          <input
            className={styles.input}
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="输入答案"
            autoFocus
          />
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.btn} type="submit">
            确认
          </button>
        </form>
      </div>
    </div>
  );
}
