"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { NAV_TABS, parseTab } from "@/lib/categories";
import styles from "./SiteHeader.module.css";

export function SiteHeader() {
  const searchParams = useSearchParams();
  const active = parseTab(searchParams.get("tab") ?? undefined);

  return (
    <header className={styles.bar}>
      <div className={styles.inner}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandText}>
            <span className={styles.brandName}>校园墙</span>
            <span className={styles.brandTag}>Campus wall</span>
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
          <Link className={styles.btnGhost} href="/login">
            登录
          </Link>
          <Link className={styles.btnSolid} href="/register">
            注册
          </Link>
        </div>
      </div>
    </header>
  );
}
