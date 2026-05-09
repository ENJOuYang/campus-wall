import Link from "next/link";
import styles from "../placeholder.module.css";

export default function RegisterPage() {
  return (
    <main className={styles.main}>
      <div className={styles.card}>
        <h1 className={styles.h1}>注册</h1>
        <p className={styles.p}>注册流程尚未接入，可在此页接邀请码 / 学号验证等。</p>
        <Link className={styles.link} href="/">
          ← 返回首页
        </Link>
      </div>
    </main>
  );
}
