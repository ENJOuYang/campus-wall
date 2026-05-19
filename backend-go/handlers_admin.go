package main

import (
	"net/http"
	"strconv"
	"strings"
)

func (s *Server) handleAdminLogin(w http.ResponseWriter, r *http.Request) {
	if strings.TrimSpace(s.cfg.AdminToken) == "" {
		writeDetail(w, http.StatusForbidden, "管理员功能未启用")
		return
	}
	token := extractBearerToken(r.Header.Get("Authorization"))
	if token == "" {
		writeDetail(w, http.StatusUnauthorized, "未提供管理员令牌")
		return
	}
	role, _ := s.adminRoleForToken(r.Context(), token)
	if role == "" {
		writeDetail(w, http.StatusForbidden, "管理员令牌无效")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "role": role})
}

func (s *Server) handleAdminListAdmins(w http.ResponseWriter, r *http.Request) {
	if err := s.requireSuperAdmin(r); err != nil {
		writeDetail(w, authErrorStatus(err.Error()), err.Error())
		return
	}
	rows, err := s.db.QueryContext(r.Context(), `SELECT id, username, nickname, role, created_at FROM users WHERE role = 'admin' ORDER BY created_at DESC`)
	if err != nil {
		writeDetail(w, http.StatusInternalServerError, "加载失败")
		return
	}
	defer rows.Close()
	result := make([]map[string]any, 0)
	for rows.Next() {
		var id int64
		var username, nickname, role, createdAt string
		if err := rows.Scan(&id, &username, &nickname, &role, &createdAt); err != nil {
			writeDetail(w, http.StatusInternalServerError, "加载失败")
			return
		}
		result = append(result, map[string]any{
			"id":         id,
			"username":   username,
			"nickname":   nickname,
			"role":       role,
			"created_at": normalizeTimestamp(createdAt),
		})
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleAdminAddAdmin(w http.ResponseWriter, r *http.Request) {
	if err := s.requireSuperAdmin(r); err != nil {
		writeDetail(w, authErrorStatus(err.Error()), err.Error())
		return
	}
	var payload AdminUserActionRequest
	if err := decodeJSON(r, &payload); err != nil || strings.TrimSpace(payload.Username) == "" {
		writeDetail(w, http.StatusBadRequest, "请求格式错误")
		return
	}
	user, err := s.getUserByUsername(r.Context(), strings.TrimSpace(payload.Username))
	if err != nil {
		writeDetail(w, http.StatusNotFound, "该用户不存在")
		return
	}
	if user.Role == "admin" {
		writeDetail(w, http.StatusBadRequest, "该用户已是管理员")
		return
	}
	if _, err := s.db.ExecContext(r.Context(), `UPDATE users SET role = 'admin' WHERE id = ?`, user.ID); err != nil {
		writeDetail(w, http.StatusInternalServerError, "添加失败")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"message":  "已将 " + user.Username + " 提升为管理员",
		"username": user.Username,
	})
}

func (s *Server) handleAdminRemoveAdmin(w http.ResponseWriter, r *http.Request) {
	if err := s.requireSuperAdmin(r); err != nil {
		writeDetail(w, authErrorStatus(err.Error()), err.Error())
		return
	}
	userID, err := parsePathInt64(r, "userID")
	if err != nil {
		writeDetail(w, http.StatusBadRequest, "无效的用户 ID")
		return
	}
	var username string
	err = s.db.QueryRowContext(r.Context(), `SELECT username FROM users WHERE id = ? AND role = 'admin'`, userID).Scan(&username)
	if err != nil {
		writeDetail(w, http.StatusNotFound, "管理员不存在")
		return
	}
	if _, err := s.db.ExecContext(r.Context(), `UPDATE users SET role = 'user' WHERE id = ?`, userID); err != nil {
		writeDetail(w, http.StatusInternalServerError, "移除失败")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"message":  "已移除管理员 " + username,
		"username": username,
	})
}

func (s *Server) handleAdminListPosts(w http.ResponseWriter, r *http.Request) {
	if _, err := s.requireAdmin(r); err != nil {
		writeDetail(w, authErrorStatus(err.Error()), err.Error())
		return
	}
	queryParams := r.URL.Query()
	status := strings.TrimSpace(queryParams.Get("status"))
	skip, _ := strconv.Atoi(queryParams.Get("skip"))
	limit, _ := strconv.Atoi(queryParams.Get("limit"))
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}

	query := `SELECT id, user_id, title, body, category, image_urls, view_count, like_count, status, ticket_status, created_at FROM posts`
	args := make([]any, 0)
	if status != "" {
		query += " WHERE status = ?"
		args = append(args, status)
	}
	query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
	args = append(args, limit, skip)

	rows, err := s.db.QueryContext(r.Context(), query, args...)
	if err != nil {
		writeDetail(w, http.StatusInternalServerError, "加载失败")
		return
	}
	defer rows.Close()
	posts := make([]postRecord, 0)
	for rows.Next() {
		post, err := scanPost(rows)
		if err != nil {
			writeDetail(w, http.StatusInternalServerError, "加载失败")
			return
		}
		posts = append(posts, post)
	}
	items, err := s.buildPostReads(r.Context(), posts, "")
	if err != nil {
		writeDetail(w, http.StatusInternalServerError, "加载失败")
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) handleAdminActOnPost(w http.ResponseWriter, r *http.Request) {
	if _, err := s.requireAdmin(r); err != nil {
		writeDetail(w, authErrorStatus(err.Error()), err.Error())
		return
	}
	postID, err := parsePathInt64(r, "postID")
	if err != nil {
		writeDetail(w, http.StatusBadRequest, "无效的帖子 ID")
		return
	}
	var payload AdminPostActionRequest
	if err := decodeJSON(r, &payload); err != nil {
		writeDetail(w, http.StatusBadRequest, "请求格式错误")
		return
	}
	post, err := s.getPostByID(r.Context(), postID)
	if err != nil {
		writeDetail(w, http.StatusNotFound, "帖子不存在")
		return
	}
	switch payload.Action {
	case "delete":
		if _, err := s.db.ExecContext(r.Context(), `DELETE FROM posts WHERE id = ?`, postID); err != nil {
			writeDetail(w, http.StatusInternalServerError, "操作失败")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"message": "帖子已删除"})
	case "approve", "reject":
		status := map[string]string{"approve": "approved", "reject": "rejected"}[payload.Action]
		if _, err := s.db.ExecContext(r.Context(), `UPDATE posts SET status = ? WHERE id = ?`, status, postID); err != nil {
			writeDetail(w, http.StatusInternalServerError, "操作失败")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"message": "帖子已" + status, "status": status})
	default:
		_ = post
		writeDetail(w, http.StatusBadRequest, "请求格式错误")
	}
}

func (s *Server) handleAdminSetTicketStatus(w http.ResponseWriter, r *http.Request) {
	if _, err := s.requireAdmin(r); err != nil {
		writeDetail(w, authErrorStatus(err.Error()), err.Error())
		return
	}
	postID, err := parsePathInt64(r, "postID")
	if err != nil {
		writeDetail(w, http.StatusBadRequest, "无效的帖子 ID")
		return
	}
	var payload TicketStatusActionRequest
	if err := decodeJSON(r, &payload); err != nil {
		writeDetail(w, http.StatusBadRequest, "请求格式错误")
		return
	}
	post, err := s.getPostByID(r.Context(), postID)
	if err != nil {
		writeDetail(w, http.StatusNotFound, "帖子不存在")
		return
	}
	if post.Category != "ticket" {
		writeDetail(w, http.StatusBadRequest, "仅工单帖子可设置工单状态")
		return
	}
	switch payload.TicketStatus {
	case "open", "processing", "completed", "closed":
	default:
		writeDetail(w, http.StatusBadRequest, "请求格式错误")
		return
	}
	if _, err := s.db.ExecContext(r.Context(), `UPDATE posts SET ticket_status = ? WHERE id = ?`, payload.TicketStatus, postID); err != nil {
		writeDetail(w, http.StatusInternalServerError, "操作失败")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"message":       "工单状态已更新",
		"ticket_status": payload.TicketStatus,
	})
}

func (s *Server) handleAdminListReports(w http.ResponseWriter, r *http.Request) {
	if _, err := s.requireAdmin(r); err != nil {
		writeDetail(w, authErrorStatus(err.Error()), err.Error())
		return
	}
	queryParams := r.URL.Query()
	resolvedRaw := strings.TrimSpace(queryParams.Get("resolved"))
	skip, _ := strconv.Atoi(queryParams.Get("skip"))
	limit, _ := strconv.Atoi(queryParams.Get("limit"))
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}

	query := `SELECT id, post_id, user_id, reason, fingerprint, created_at, resolved, resolved_at, resolved_by FROM reports`
	args := make([]any, 0)
	if resolvedRaw != "" {
		query += " WHERE resolved = ?"
		args = append(args, parseBoolLike(resolvedRaw))
	}
	query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
	args = append(args, limit, skip)

	rows, err := s.db.QueryContext(r.Context(), query, args...)
	if err != nil {
		writeDetail(w, http.StatusInternalServerError, "加载失败")
		return
	}
	defer rows.Close()
	result := make([]ReportRead, 0)
	for rows.Next() {
		report, err := scanReport(rows)
		if err != nil {
			writeDetail(w, http.StatusInternalServerError, "加载失败")
			return
		}
		result = append(result, ReportRead{
			ID:          report.ID,
			PostID:      report.PostID,
			Reason:      report.Reason,
			Fingerprint: report.Fingerprint,
			CreatedAt:   normalizeTimestamp(report.CreatedAt),
			Resolved:    report.Resolved,
			ResolvedAt:  nullableString(sqlNullStringLike{String: report.ResolvedAt.String, Valid: report.ResolvedAt.Valid}),
			ResolvedBy:  nullableString(sqlNullStringLike{String: report.ResolvedBy.String, Valid: report.ResolvedBy.Valid}),
		})
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleAdminResolveReport(w http.ResponseWriter, r *http.Request) {
	if _, err := s.requireAdmin(r); err != nil {
		writeDetail(w, authErrorStatus(err.Error()), err.Error())
		return
	}
	reportID, err := parsePathInt64(r, "reportID")
	if err != nil {
		writeDetail(w, http.StatusBadRequest, "无效的举报 ID")
		return
	}
	var payload AdminResolveReportRequest
	if err := decodeJSON(r, &payload); err != nil {
		writeDetail(w, http.StatusBadRequest, "请求格式错误")
		return
	}
	var exists int
	if err := s.db.QueryRowContext(r.Context(), `SELECT 1 FROM reports WHERE id = ?`, reportID).Scan(&exists); err != nil {
		writeDetail(w, http.StatusNotFound, "举报不存在")
		return
	}
	if payload.Resolved {
		if _, err := s.db.ExecContext(r.Context(), `UPDATE reports SET resolved = 1, resolved_at = ?, resolved_by = 'admin' WHERE id = ?`, currentTimestamp(), reportID); err != nil {
			writeDetail(w, http.StatusInternalServerError, "操作失败")
			return
		}
	} else {
		if _, err := s.db.ExecContext(r.Context(), `UPDATE reports SET resolved = 0, resolved_at = NULL, resolved_by = NULL WHERE id = ?`, reportID); err != nil {
			writeDetail(w, http.StatusInternalServerError, "操作失败")
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "举报已处理"})
}

func (s *Server) handleAdminListUsers(w http.ResponseWriter, r *http.Request) {
	if _, err := s.requireAdmin(r); err != nil {
		writeDetail(w, authErrorStatus(err.Error()), err.Error())
		return
	}
	queryParams := r.URL.Query()
	search := strings.TrimSpace(queryParams.Get("search"))
	banned := strings.TrimSpace(queryParams.Get("banned"))
	skip, _ := strconv.Atoi(queryParams.Get("skip"))
	limit, _ := strconv.Atoi(queryParams.Get("limit"))
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}

	query := `SELECT id, phone, email, username, nickname, password_hash, is_banned, fingerprint, role, created_at FROM users`
	args := make([]any, 0)
	filters := make([]string, 0)
	if search != "" {
		like := "%" + search + "%"
		filters = append(filters, "(username LIKE ? OR nickname LIKE ?)")
		args = append(args, like, like)
	}
	if banned != "" {
		filters = append(filters, "is_banned = ?")
		args = append(args, parseBoolLike(banned))
	}
	if len(filters) > 0 {
		query += " WHERE " + strings.Join(filters, " AND ")
	}
	query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
	args = append(args, limit, skip)

	rows, err := s.db.QueryContext(r.Context(), query, args...)
	if err != nil {
		writeDetail(w, http.StatusInternalServerError, "加载失败")
		return
	}
	defer rows.Close()
	result := make([]AdminUserRead, 0)
	for rows.Next() {
		user, err := scanUser(rows)
		if err != nil {
			writeDetail(w, http.StatusInternalServerError, "加载失败")
			return
		}
		result = append(result, AdminUserRead{
			ID:       user.ID,
			Username: user.Username,
			Nickname: user.Nickname,
			Phone:    nullableString(sqlNullStringLike{String: user.Phone.String, Valid: user.Phone.Valid}),
			Email:    nullableString(sqlNullStringLike{String: user.Email.String, Valid: user.Email.Valid}),
			IsBanned: user.IsBanned,
		})
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleAdminBanUser(w http.ResponseWriter, r *http.Request) {
	if _, err := s.requireAdmin(r); err != nil {
		writeDetail(w, authErrorStatus(err.Error()), err.Error())
		return
	}
	userID, err := parsePathInt64(r, "userID")
	if err != nil {
		writeDetail(w, http.StatusBadRequest, "无效的用户 ID")
		return
	}
	var payload AdminBanUserRequest
	if err := decodeJSON(r, &payload); err != nil {
		writeDetail(w, http.StatusBadRequest, "请求格式错误")
		return
	}
	user, err := s.getUserByID(r.Context(), userID)
	if err != nil {
		writeDetail(w, http.StatusNotFound, "用户不存在")
		return
	}
	if _, err := s.db.ExecContext(r.Context(), `UPDATE users SET is_banned = ? WHERE id = ?`, payload.Banned, userID); err != nil {
		writeDetail(w, http.StatusInternalServerError, "操作失败")
		return
	}
	action := "解封"
	if payload.Banned {
		action = "封禁"
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"message":   "用户 " + user.Username + " 已" + action,
		"is_banned": payload.Banned,
	})
}
