# DS 校园墙

一个开源的校园社区平台，支持发帖、评论、点赞、通知等完整功能。

- **后端**：Go + SQLite（新实现位于 `backend-go/`）
- **前端**：Next.js 15 (App Router)
- **旧后端**：FastAPI + SQLAlchemy + SQLite（保留在 `backend/` 作为迁移参考）

## 功能

- 帖子：分类浏览（灌水/学习/公告/工单）、全文搜索、Markdown 正文、图片上传
- 互动：评论（支持嵌套回复）、评论点赞、帖子点赞
- 用户：注册/登录（JWT）、个人主页、管理员分级（超级管理员/普通管理员）
- 通知：点赞、评论、回复、评论点赞
- 安全：速率限制、bcrypt 密码哈希、文件上传白名单
- 其他：入站网关、邀请码验证、工单状态流转、内容审核

## 环境要求

- Go 1.23+（或直接使用 Docker）
- Node.js 18+
- Docker 29+（可选，用于一键部署）

## 本地运行

### Go 后端

```bash
cd backend-go
cp .env.example .env
go run .
```

- 健康检查：http://127.0.0.1:8000/health

### 旧 Python 后端

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 前端

需另开终端，保持后端在 8000 端口运行：

```bash
cd frontend
npm install
npm run dev
```

浏览器打开 http://127.0.0.1:3000。

### Docker 部署

```bash
docker compose up --build
```

- 前端：http://127.0.0.1:3000
- 后端：http://127.0.0.1:8000
- 默认会使用 Go 后端 `backend-go/`

### 生产构建

```bash
docker compose up -d --build
```

## 环境变量

- Go 后端：`backend-go/.env`（参考 `backend-go/.env.example`）
- 旧 Python 后端：`backend/.env`（参考 `backend/.env.example`）
- 前端：`frontend/.env.local`（主要是 `BACKEND_URL`，指向后端地址）

## API 概要

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/posts` | 帖子列表（支持分类、搜索、排序、分页） |
| POST | `/api/posts` | 发帖 |
| GET | `/api/posts/{id}` | 帖子详情 |
| POST | `/api/posts/{id}/like` | 点赞帖子 |
| POST | `/api/posts/{id}/view` | 浏览计数 |
| GET | `/api/posts/{id}/comments` | 评论列表（嵌套树） |
| POST | `/api/posts/{id}/comments` | 发表评论（支持 parent_id 回复） |
| POST | `/api/posts/{id}/comments/{cid}/like` | 点赞评论 |
| POST | `/api/posts/{id}/report` | 举报帖子 |
| POST | `/api/auth/register` | 注册 |
| POST | `/api/auth/login` | 登录 |
| GET | `/api/notifications` | 通知列表 |
| POST | `/api/uploads` | 上传图片 |

## 项目结构

```
backend-go/
├── main.go             # Go API 入口
├── Dockerfile          # Go 后端镜像
└── *.go                # 路由、鉴权、数据库初始化

backend/
├── app/
│   ├── main.py          # FastAPI 入口
│   ├── config.py        # 配置 & 速率限制
│   ├── database.py      # 数据库 & 迁移
│   ├── auth.py          # JWT & bcrypt
│   ├── models/          # ORM 模型
│   ├── schemas/         # Pydantic 校验
│   └── routers/         # API 路由
└── uploads/             # 上传文件目录

frontend/
├── src/
│   ├── app/             # Next.js App Router 页面
│   ├── components/      # React 组件
│   └── lib/             # 工具函数 & API 调用
├── Dockerfile           # 前端镜像
└── next.config.ts       # 代理配置
```

## 许可证

MIT
