import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "校园墙",
  description: "校园墙 — UI 由你自行设计，此处仅提供页面骨架。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
