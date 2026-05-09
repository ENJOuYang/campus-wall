import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import layoutStyles from "./layout.module.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "校园墙",
  description: "校园墙 — 简约黑白风格分区浏览与发帖。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="app-body">
        <Suspense fallback={<div className={layoutStyles.skeleton} aria-hidden />}>
          <SiteHeader />
        </Suspense>
        <div className="app-main">{children}</div>
      </body>
    </html>
  );
}
