import type { NextConfig } from "next";

/** 浏览器访问 /api/* 时转发到 FastAPI，避免前端写死后端端口。 */
const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
