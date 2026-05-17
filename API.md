# DS 校园墙 API 文档

> 基础地址: `https://dswall.icu/api`  
> 所有响应均为 JSON 格式  
> 需要登录的接口在请求头中加上 `Authorization: Bearer <token>`

---

## 1. 认证 (Auth)

### 1.1 验证问题
```
POST /auth/gate
```
**Request Body:**
```json
{ "answer": "13" }
```
**Response 200:** `{ "ok": true }`

> 答案：ds 的中餐多少钱一份？→ `13`

---

### 1.2 获取邀请码
```
GET /auth/invite
```
**Response 200:** `{ "invite_code": "xxxxxx" }`

> 邀请码 10 分钟有效，需先通过 gate 验证

---

### 1.3 注册
```
POST /auth/register
```
**Request Body:**
```json
{
  "username": "string (必填)",
  "nickname": "string (必填)",
  "password": "string (必填)",
  "phone": "string | null",
  "email": "string (邮箱格式) | null",
  "invite_code": "string | null"
}
```
**Response 201:**
```json
{
  "access_token": "jwt_token",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "username": "xxx",
    "nickname": "xxx",
    "phone": null,
    "email": null,
    "role": "user",
    "created_at": "2026-01-01T00:00:00Z",
    "is_banned": false
  }
}
```

---

### 1.4 登录
```
POST /auth/login
```
**Request Body:**
```json
{
  "account": "用户名或手机号",
  "password": "密码"
}
```
**Response 200:** 同注册返回格式

---

### 1.5 获取当前用户信息
```
GET /auth/me
Authorization: Bearer <token>
```
**Response 200:** `UserResponse` 对象

---

### 1.6 查看用户主页
```
GET /auth/users/{username}
```
**Response 200:** 用户公开信息

---

## 2. 帖子 (Posts)

### 2.1 帖子列表
```
GET /posts?skip=0&limit=20&sort=latest&fingerprint=xxx&category=general&search=关键词
```
| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| skip | int | 0 | 跳过条数 |
| limit | int | 20 (max 100) | 每页条数 |
| sort | string | latest | latest / hot |
| fingerprint | string | - | 浏览器指纹(用于判断是否已点赞) |
| category | string | - | 分类筛选: general / ticket / notice / ... |
| search | string | - | 标题+正文搜索 |

**Response 200:**
```json
{
  "items": [ PostRead, ... ],
  "total": 100
}
```

---

### 2.2 帖子详情
```
GET /posts/{post_id}?fingerprint=xxx
```
**Response 200:** `PostRead`

---

### 2.3 发布帖子
```
POST /posts
Authorization: Bearer <token>
```
**Request Body:**
```json
{
  "title": "标题 (1-200字, 必填)",
  "body": "正文, 支持 Markdown (1-10000字, 必填)",
  "category": "general (默认)",
  "image_urls": ["/api/uploads/xxx.jpg"],
  "anonymous": false
}
```
**Response 201:** `PostRead`

> 分类说明: `general` 普通帖, `ticket` 工单, `notice` 公告(仅管理员)

---

### 2.4 删除帖子
```
DELETE /posts/{post_id}
Authorization: Bearer <token>
```
> 仅帖主可删除

---

### 2.5 增加浏览量
```
POST /posts/{post_id}/view
```
**Response 200:** `{ "view_count": 10 }`

---

### 2.6 帖子点赞/取消
```
POST /posts/{post_id}/like
Authorization: Bearer <token> (可选)
```
**Request Body:**
```json
{ "fingerprint": "浏览器指纹" }
```
**Response 200:**
```json
{
  "liked": true,
  "like_count": 5
}
```
> 同一 fingerprint 或同一用户只能点一次，再次请求 = 取消

---

### 2.7 评论点赞/取消
```
POST /posts/{post_id}/comments/{comment_id}/like
Authorization: Bearer <token> (可选)
```
**Request Body:**
```json
{ "fingerprint": "浏览器指纹" }
```
**Response 200:**
```json
{
  "liked": true,
  "like_count": 3
}
```

---

### 2.8 评论列表
```
GET /posts/{post_id}/comments?fingerprint=xxx
```
**Response 200:** `CommentRead[]` (树形结构，replies 嵌套)

---

### 2.9 发表评论
```
POST /posts/{post_id}/comments
Authorization: Bearer <token>
```
**Request Body:**
```json
{
  "body": "评论内容 (1-2000字, 支持 Markdown)",
  "fingerprint": "浏览器指纹",
  "parent_id": null
}
```
> `parent_id` 不为 null 时 = 回复某条评论

**Response 201:** `CommentRead`

---

### 2.10 删除评论
```
DELETE /posts/{post_id}/comments/{comment_id}
Authorization: Bearer <token>
```
> 仅评论者本人或管理员可删除

---

### 2.11 举报帖子
```
POST /posts/{post_id}/report
Authorization: Bearer <token> (可选)
```
**Request Body:**
```json
{
  "reason": "举报原因 (1-500字)",
  "fingerprint": "浏览器指纹"
}
```
**Response 201:** `{ "message": "举报已提交" }`

---

## 3. 图片上传 (Uploads)

### 3.1 上传图片
```
POST /uploads
Content-Type: multipart/form-data
```
**Form Data:** `file` (图片文件)

**Response 200:**
```json
{ "url": "/api/uploads/xxx.jpg" }
```

> 返回的 url 即为图片访问路径，可放入帖子的 `image_urls` 数组

---

## 4. 通知 (Notifications)

> 以下接口均需登录

### 4.1 通知列表
```
GET /notifications
Authorization: Bearer <token>
```
**Response 200:** `NotificationRead[]`
```json
[{
  "id": 1,
  "type": "like|comment|reply|comment_like",
  "post_id": 5,
  "from_username": "xxx",
  "from_nickname": "xxx",
  "is_read": false,
  "created_at": "2026-01-01T00:00:00Z"
}]
```

---

### 4.2 未读数量
```
GET /notifications/unread-count
Authorization: Bearer <token>
```
**Response 200:** `{ "count": 3 }`

---

### 4.3 标记已读
```
PATCH /notifications/{notification_id}/read
Authorization: Bearer <token>
```

---

### 4.4 全部已读
```
PATCH /notifications/read-all
Authorization: Bearer <token>
```

---

## 5. 管理员 (Admin)

> 管理员接口使用 Admin Token（与用户 JWT 不同）

### 5.1 管理员登录
```
POST /admin/login
Authorization: Bearer <admin_token>
```
**Response 200:** `{ "ok": true, "role": "super_admin|admin" }`

---

### 5.2 帖子管理列表
```
GET /admin/posts?status=pending&skip=0&limit=50
Authorization: Bearer <admin_token>
```
| 参数 | 说明 |
|------|------|
| status | pending / approved / rejected |

---

### 5.3 审核帖子
```
PATCH /admin/posts/{post_id}
Authorization: Bearer <admin_token>
```
**Request Body:**
```json
{ "action": "approve|reject|delete" }
```

---

### 5.4 设置工单状态
```
PATCH /admin/posts/{post_id}/ticket-status
Authorization: Bearer <admin_token>
```
**Request Body:**
```json
{ "ticket_status": "open|processing|completed|closed" }
```

---

### 5.5 举报列表
```
GET /admin/reports?resolved=false&skip=0&limit=50
Authorization: Bearer <admin_token>
```

---

### 5.6 处理举报
```
PATCH /admin/reports/{report_id}
Authorization: Bearer <admin_token>
```
**Request Body:**
```json
{ "resolved": true }
```

---

### 5.7 用户列表
```
GET /admin/users?skip=0&limit=50&search=xxx&banned=false
Authorization: Bearer <admin_token>
```

---

### 5.8 封禁/解封用户
```
PATCH /admin/users/{user_id}/ban
Authorization: Bearer <admin_token>
```
**Request Body:**
```json
{ "banned": true }
```

---

### 5.9 管理员列表
```
GET /admin/admins
Authorization: Bearer <admin_token>
```

---

### 5.10 添加管理员
```
POST /admin/admins
Authorization: Bearer <admin_token>
```
**Request Body:**
```json
{ "username": "要提升的用户名" }
```

---

### 5.11 移除管理员
```
DELETE /admin/admins/{user_id}
Authorization: Bearer <admin_token>
```

---

## 通用数据结构

### PostRead (帖子)
```json
{
  "id": 1,
  "title": "帖子标题",
  "body": "正文 (Markdown)",
  "category": "general",
  "created_at": "2026-01-01T00:00:00+00:00",
  "image_urls": ["/api/uploads/xxx.jpg"],
  "view_count": 100,
  "like_count": 10,
  "is_liked": false,
  "status": "approved",
  "ticket_status": null,
  "author": { "username": "xxx", "nickname": "昵称" }
}
```

### CommentRead (评论)
```json
{
  "id": 1,
  "post_id": 5,
  "body": "评论内容",
  "fingerprint": "abc123",
  "created_at": "2026-01-01T00:00:00+00:00",
  "author": { "username": "xxx", "nickname": "昵称" },
  "parent_id": null,
  "replies": [ /* CommentRead... */ ],
  "like_count": 3,
  "is_liked": true
}
```

---

## 附录：在线 Swagger 文档

浏览器打开可交互调试：
- **Swagger UI:** https://dswall.icu/docs
- **ReDoc:** https://dswall.icu/redoc
