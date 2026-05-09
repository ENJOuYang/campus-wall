# 校园墙

校园墙后端（FastAPI + SQLAlchemy + SQLite）。

## 环境要求

- Python 3.11+（当前开发环境为 3.14 亦可）

## 本地运行

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

## 环境变量

见 `backend/.env.example`。不要将真实的 `backend/.env` 或密钥文件提交到仓库（已在 `.gitignore` 中忽略）。

## 接口概要

- `GET /api/posts`：分页列表
- `POST /api/posts`：发帖
- `GET /api/posts/{id}`：单帖详情

## 许可证

未指定；可按需补充 `LICENSE`。
