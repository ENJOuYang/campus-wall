package main

import "database/sql"

type AuthorInfo struct {
	Username string `json:"username"`
	Nickname string `json:"nickname"`
}

type PostCreateRequest struct {
	Title     string   `json:"title"`
	Body      string   `json:"body"`
	Category  string   `json:"category"`
	ImageURLs []string `json:"image_urls"`
	Anonymous bool     `json:"anonymous"`
}

type PostRead struct {
	ID         int64       `json:"id"`
	Title      string      `json:"title"`
	Body       string      `json:"body"`
	Category   string      `json:"category"`
	CreatedAt  string      `json:"created_at"`
	ImageURLs  []string    `json:"image_urls"`
	ViewCount  int         `json:"view_count"`
	LikeCount  int         `json:"like_count"`
	IsLiked    bool        `json:"is_liked"`
	Status     string      `json:"status"`
	TicketStatus *string   `json:"ticket_status"`
	Author     *AuthorInfo `json:"author"`
}

type PostListResponse struct {
	Items []PostRead `json:"items"`
	Total int        `json:"total"`
}

type CommentCreateRequest struct {
	Body        string `json:"body"`
	Fingerprint string `json:"fingerprint"`
	ParentID    *int64 `json:"parent_id"`
}

type CommentRead struct {
	ID         int64       `json:"id"`
	PostID     int64       `json:"post_id"`
	Body       string      `json:"body"`
	Fingerprint string     `json:"fingerprint"`
	CreatedAt  string      `json:"created_at"`
	Author     *AuthorInfo `json:"author"`
	ParentID   *int64      `json:"parent_id"`
	Replies    []CommentRead `json:"replies"`
	LikeCount  int         `json:"like_count"`
	IsLiked    bool        `json:"is_liked"`
}

type LikeCreateRequest struct {
	Fingerprint string `json:"fingerprint"`
}

type LikeToggleResponse struct {
	Liked     bool `json:"liked"`
	LikeCount int  `json:"like_count"`
}

type ReportCreateRequest struct {
	Reason      string `json:"reason"`
	Fingerprint string `json:"fingerprint"`
}

type ReportRead struct {
	ID         int64   `json:"id"`
	PostID     int64   `json:"post_id"`
	Reason     string  `json:"reason"`
	Fingerprint string `json:"fingerprint"`
	CreatedAt  string  `json:"created_at"`
	Resolved   bool    `json:"resolved"`
	ResolvedAt *string `json:"resolved_at"`
	ResolvedBy *string `json:"resolved_by"`
}

type GateVerifyRequest struct {
	Answer string `json:"answer"`
}

type UserRegisterRequest struct {
	Username   string  `json:"username"`
	Nickname   string  `json:"nickname"`
	Password   string  `json:"password"`
	Phone      *string `json:"phone"`
	Email      *string `json:"email"`
	InviteCode *string `json:"invite_code"`
}

type UserLoginRequest struct {
	Account  string `json:"account"`
	Password string `json:"password"`
}

type UserResponse struct {
	ID        int64   `json:"id"`
	Username  string  `json:"username"`
	Nickname  string  `json:"nickname"`
	Phone     *string `json:"phone"`
	Email     *string `json:"email"`
	Role      string  `json:"role"`
	CreatedAt string  `json:"created_at"`
	IsBanned  bool    `json:"is_banned"`
}

type TokenResponse struct {
	AccessToken string       `json:"access_token"`
	TokenType   string       `json:"token_type"`
	User        UserResponse `json:"user"`
}

type NotificationRead struct {
	ID           int64   `json:"id"`
	Type         string  `json:"type"`
	PostID       int64   `json:"post_id"`
	FromUsername *string `json:"from_username"`
	FromNickname *string `json:"from_nickname"`
	IsRead       bool    `json:"is_read"`
	CreatedAt    string  `json:"created_at"`
}

type AdminPostActionRequest struct {
	Action string `json:"action"`
}

type TicketStatusActionRequest struct {
	TicketStatus string `json:"ticket_status"`
}

type AdminResolveReportRequest struct {
	Resolved bool `json:"resolved"`
}

type AdminUserActionRequest struct {
	Username string `json:"username"`
}

type AdminBanUserRequest struct {
	Banned bool `json:"banned"`
}

type AdminUserRead struct {
	ID       int64   `json:"id"`
	Username string  `json:"username"`
	Nickname string  `json:"nickname"`
	Phone    *string `json:"phone"`
	Email    *string `json:"email"`
	IsBanned bool    `json:"is_banned"`
}

type userRecord struct {
	ID           int64
	Phone        sql.NullString
	Email        sql.NullString
	Username     string
	Nickname     string
	PasswordHash string
	IsBanned     bool
	Fingerprint  sql.NullString
	Role         string
	CreatedAt    string
}

type postRecord struct {
	ID           int64
	UserID       sql.NullInt64
	Title        string
	Body         string
	Category     string
	ImageURLsRaw sql.NullString
	ViewCount    int
	Status       string
	TicketStatus sql.NullString
	CreatedAt    string
}

type commentRecord struct {
	ID          int64
	PostID      int64
	ParentID    sql.NullInt64
	UserID      sql.NullInt64
	Body        string
	Fingerprint string
	CreatedAt   string
}

type reportRecord struct {
	ID         int64
	PostID     int64
	UserID     sql.NullInt64
	Reason     string
	Fingerprint string
	CreatedAt  string
	Resolved   bool
	ResolvedAt sql.NullString
	ResolvedBy sql.NullString
}

type notificationRecord struct {
	ID         int64
	UserID     int64
	Type       string
	PostID     int64
	CommentID  sql.NullInt64
	FromUserID sql.NullInt64
	IsRead     bool
	CreatedAt  string
}
