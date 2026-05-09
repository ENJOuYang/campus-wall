import Link from "next/link";
import styles from "../placeholder.module.css";

export default function LoginPage() {
  return (
    <main className={styles.main}>
      <div className={styles.card}>
        <h1 className={styles.h1}>登录</h1>
        <p className={styles.p}>登录流程尚未接入，可在此页接学校统一认证或邮箱登录。</p>
        <Link className={styles.link} href="/">
          ← 返回首页
        </Link>
      </div>
    </main>
  );
}
