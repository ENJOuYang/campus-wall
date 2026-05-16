"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { NAV_TABS, parseTab } from "@/lib/categories";
import { useAuth } from "@/lib/auth-context";
import { togglePostForm } from "@/lib/post-form-toggle";
import { NotificationBell } from "./NotificationBell";
import styles from "./SiteHeader.module.css";

export function SiteHeader() {
  const searchParams = useSearchParams();
  const active = parseTab(searchParams.get("tab") ?? undefined);
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  return (
    <header className={styles.bar}>
      <div className={styles.inner}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandText}>
            <span className={styles.brandName}>校园墙</span>
            <span className={styles.brandTag}>DS Campus Wall</span>
          </span>
        </Link>

        <nav className={styles.navWrap} aria-label="分区">
          <div className={styles.nav}>
            {NAV_TABS.map(({ slug, label, href }) => (
              <Link
                key={slug}
                href={href}
                className={`${styles.tab} ${active === slug ? styles.tabActive : ""}`}
              >
                {label}
              </Link>
            ))}
          </div>
        </nav>

        <div className={styles.actions}>
          {!loading && (
            <>
              {user ? (
                <>
                  <button className={styles.btnGhost} onClick={togglePostForm}>
                    +发帖
                  </button>
                  <NotificationBell />
                  <Link href={`/user/${user.username}`} className={styles.userTag}>{user.nickname}</Link>
                  <button className={styles.btnGhost} onClick={handleLogout}>
                    退出
                  </button>
                </>
              ) : (
                <>
                  <Link className={styles.btnGhost} href="/login">
                    登录
                  </Link>
                  <Link className={styles.btnGhost} href="/register">
                    注册
                  </Link>
                </>
              )}
            </>
          )}
          <Link className={styles.btnGhost} href="/admin">
            管理
          </Link>
        </div>
      </div>
    </header>
  );
}
