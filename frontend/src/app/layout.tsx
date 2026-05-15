import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchProvider } from "@/lib/search-context";
import { AuthProvider } from "@/lib/auth-context";
import { GateGuard } from "@/components/GateGuard";
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
        <AuthProvider>
          <GateGuard>
          <SearchProvider>
            <Suspense fallback={<div className={layoutStyles.skeleton} aria-hidden />}>
              <SiteHeader />
            </Suspense>
            <div className="app-main">{children}</div>
          </SearchProvider>
          </GateGuard>
        </AuthProvider>
      </body>
    </html>
  );
}
