# 校园墙

校园墙：**FastAPI 后端** + **Next.js（App Router）前端**（SQLite 开发库）。首页帖子列表为 **服务端拉取**（SSR 数据），发帖表单为 **Client Component**；默认几乎无样式，方便你自行设计 UI。

## 环境要求

- Python 3.11+（当前开发环境为 3.14 亦可）
- Node.js 18+ 与 npm（用于前端）

## 后端本地运行

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # 按需编辑 .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- 健康检查：<http://127.0.0.1:8000/health>
- 交互式 API 文档：<http://127.0.0.1:8000/docs>

## 前端本地运行（Next.js）

需**另开一个终端**，保持后端在 **8000** 端口运行。

```bash
cd frontend
npm install
npm run dev
```

浏览器打开 <http://127.0.0.1:3000>。  
- 服务端请求直连 `BACKEND_URL`（默认 `http://127.0.0.1:8000`），见 `frontend/.env.example`。  
- 浏览器里对 **`/api/*`** 的请求由 Next **rewrites** 转发到同一 FastAPI，避免在客户端写死后端地址。

生产部署时把 `BACKEND_URL` 设为内网或公网可访问的 FastAPI 根地址（**不要**把只能在笔记本上访问的 `127.0.0.1` 配到线上）。

```bash
cd frontend
npm run build
npm run start
```

## 环境变量

- 后端：`backend/.env.example`  
- 前端：`frontend/.env.example`（主要是 `BACKEND_URL`）

不要将真实的 `backend/.env`、`frontend/.env.local` 或密钥文件提交到仓库（已在 `.gitignore` 中忽略）。

## 接口概要

- `GET /api/posts`：分页列表
- `POST /api/posts`：发帖
- `GET /api/posts/{id}`：单帖详情

## 许可证

未指定；可按需补充 `LICENSE`。
