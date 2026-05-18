package main

import (
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type Server struct {
	cfg     Config
	db      *sql.DB
	limiter *RateLimiter
}

func NewServer(cfg Config) (*Server, error) {
	if err := os.MkdirAll(cfg.UploadDir, 0o755); err != nil {
		return nil, fmt.Errorf("mkdir upload dir: %w", err)
	}

	db, err := openDatabase(cfg)
	if err != nil {
		return nil, err
	}

	return &Server{
		cfg:     cfg,
		db:      db,
		limiter: NewRateLimiter(),
	}, nil
}

func (s *Server) Close() error {
	if s.db != nil {
		return s.db.Close()
	}
	return nil
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /", s.handleRoot)
	mux.HandleFunc("GET /health", s.handleHealth)

	mux.HandleFunc("POST /api/auth/gate", s.handleGateVerify)
	mux.HandleFunc("GET /api/auth/invite", s.handleInviteCode)
	mux.HandleFunc("POST /api/auth/register", s.limit("register", 10, time.Minute, s.handleRegister))
	mux.HandleFunc("POST /api/auth/login", s.limit("login", 20, time.Minute, s.handleLogin))
	mux.HandleFunc("GET /api/auth/me", s.handleMe)
	mux.HandleFunc("GET /api/auth/users/{username}", s.handleUserProfile)

	mux.HandleFunc("GET /api/posts", s.handleListPosts)
	mux.HandleFunc("POST /api/posts", s.limit("create-post", 10, time.Minute, s.handleCreatePost))
	mux.HandleFunc("GET /api/posts/{postID}", s.handleGetPost)
	mux.HandleFunc("DELETE /api/posts/{postID}", s.handleDeletePost)
	mux.HandleFunc("POST /api/posts/{postID}/view", s.limit("view-post", 60, time.Minute, s.handleIncrementView))
	mux.HandleFunc("POST /api/posts/{postID}/like", s.limit("like-post", 30, time.Minute, s.handleTogglePostLike))
	mux.HandleFunc("GET /api/posts/{postID}/comments", s.handleListComments)
	mux.HandleFunc("POST /api/posts/{postID}/comments", s.limit("comment-post", 20, time.Minute, s.handleCreateComment))
	mux.HandleFunc("DELETE /api/posts/{postID}/comments/{commentID}", s.handleDeleteComment)
	mux.HandleFunc("POST /api/posts/{postID}/comments/{commentID}/like", s.limit("like-comment", 30, time.Minute, s.handleToggleCommentLike))
	mux.HandleFunc("POST /api/posts/{postID}/report", s.limit("report-post", 10, time.Minute, s.handleCreateReport))

	mux.HandleFunc("POST /api/admin/login", s.limit("admin-login", 20, time.Minute, s.handleAdminLogin))
	mux.HandleFunc("GET /api/admin/admins", s.handleAdminListAdmins)
	mux.HandleFunc("POST /api/admin/admins", s.handleAdminAddAdmin)
	mux.HandleFunc("DELETE /api/admin/admins/{userID}", s.handleAdminRemoveAdmin)
	mux.HandleFunc("GET /api/admin/posts", s.handleAdminListPosts)
	mux.HandleFunc("PATCH /api/admin/posts/{postID}", s.handleAdminActOnPost)
	mux.HandleFunc("PATCH /api/admin/posts/{postID}/ticket-status", s.handleAdminSetTicketStatus)
	mux.HandleFunc("GET /api/admin/reports", s.handleAdminListReports)
	mux.HandleFunc("PATCH /api/admin/reports/{reportID}", s.handleAdminResolveReport)
	mux.HandleFunc("GET /api/admin/users", s.handleAdminListUsers)
	mux.HandleFunc("PATCH /api/admin/users/{userID}/ban", s.handleAdminBanUser)

	mux.HandleFunc("GET /api/notifications", s.handleListNotifications)
	mux.HandleFunc("GET /api/notifications/unread-count", s.handleUnreadCount)
	mux.HandleFunc("PATCH /api/notifications/{notificationID}/read", s.handleMarkNotificationRead)
	mux.HandleFunc("PATCH /api/notifications/read-all", s.handleMarkAllNotificationsRead)

	mux.HandleFunc("POST /api/uploads", s.limit("upload", 20, time.Minute, s.handleUpload))
	mux.HandleFunc("GET /api/uploads/{filename...}", s.handleUploadedFile)

	return s.withCORS(mux)
}

func (s *Server) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) limit(bucket string, max int, window time.Duration, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !s.limiter.Allow(bucket, clientIP(r), max, window) {
			writeDetail(w, http.StatusTooManyRequests, "请求太频繁，请稍后再试。")
			return
		}
		next(w, r)
	}
}

func (s *Server) handleRoot(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"message": s.cfg.AppName,
		"health":  "/health",
		"posts":   "/api/posts",
	})
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleUploadedFile(w http.ResponseWriter, r *http.Request) {
	filename := strings.TrimSpace(r.PathValue("filename"))
	if filename == "" {
		http.NotFound(w, r)
		return
	}
	cleaned := filepath.Clean(filename)
	if cleaned == "." || strings.HasPrefix(cleaned, "..") || strings.Contains(cleaned, `\..`) {
		http.NotFound(w, r)
		return
	}
	path := filepath.Join(s.cfg.UploadDir, cleaned)
	http.ServeFile(w, r, path)
}
