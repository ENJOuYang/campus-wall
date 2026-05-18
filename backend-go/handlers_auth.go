package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func (s *Server) currentInviteCode(now time.Time) string {
	window := now.UTC().Unix() / 600
	mac := hmac.New(sha256.New, []byte(s.cfg.InviteSecret))
	_, _ = mac.Write([]byte(strconv.FormatInt(window, 10)))
	return hex.EncodeToString(mac.Sum(nil))[:8]
}

func (s *Server) verifyInviteCode(code string, now time.Time) bool {
	if strings.TrimSpace(s.cfg.InviteSecret) == "" {
		return true
	}
	code = strings.TrimSpace(code)
	if code == "" {
		return false
	}
	current := s.currentInviteCode(now)
	prevTime := now.UTC().Add(-10 * time.Minute)
	prev := s.currentInviteCode(prevTime)
	return code == current || code == prev
}

func (s *Server) handleGateVerify(w http.ResponseWriter, r *http.Request) {
	var payload GateVerifyRequest
	if err := decodeJSON(r, &payload); err != nil {
		writeDetail(w, http.StatusBadRequest, "请求格式错误")
		return
	}
	if strings.TrimSpace(payload.Answer) == s.cfg.GateAnswer {
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}
	writeDetail(w, http.StatusForbidden, "答案错误")
}

func (s *Server) handleInviteCode(w http.ResponseWriter, _ *http.Request) {
	if strings.TrimSpace(s.cfg.InviteSecret) == "" {
		writeDetail(w, http.StatusNotFound, "邀请码功能未启用")
		return
	}
	now := time.Now().UTC()
	expiresIn := 600 - (now.Unix() % 600)
	writeJSON(w, http.StatusOK, map[string]any{
		"code":       s.currentInviteCode(now),
		"expires_in": expiresIn,
	})
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var payload UserRegisterRequest
	if err := decodeJSON(r, &payload); err != nil {
		writeDetail(w, http.StatusBadRequest, "请求格式错误")
		return
	}
	payload.Username = strings.TrimSpace(payload.Username)
	payload.Nickname = strings.TrimSpace(payload.Nickname)
	payload.Password = strings.TrimSpace(payload.Password)
	if payload.Username == "" || payload.Nickname == "" || len(payload.Password) < 6 {
		writeDetail(w, http.StatusBadRequest, "请填写完整注册信息")
		return
	}
	if payload.Phone != nil {
		trimmed := strings.TrimSpace(*payload.Phone)
		if trimmed == "" {
			payload.Phone = nil
		} else {
			payload.Phone = &trimmed
		}
	}
	if payload.Email != nil {
		trimmed := strings.TrimSpace(*payload.Email)
		if trimmed == "" {
			payload.Email = nil
		} else {
			payload.Email = &trimmed
		}
	}
	if payload.Phone == nil && payload.Email == nil {
		writeDetail(w, http.StatusBadRequest, "手机号和邮箱至少填写一个")
		return
	}
	if strings.TrimSpace(s.cfg.InviteSecret) != "" {
		if payload.InviteCode == nil || strings.TrimSpace(*payload.InviteCode) == "" {
			writeDetail(w, http.StatusForbidden, "需要邀请码才能注册")
			return
		}
		if !s.verifyInviteCode(*payload.InviteCode, time.Now()) {
			writeDetail(w, http.StatusForbidden, "邀请码无效或已过期（10分钟刷新一次）")
			return
		}
	}

	if existing, err := s.getUserByUsername(r.Context(), payload.Username); err == nil && existing != nil {
		writeDetail(w, http.StatusConflict, "用户名已被注册")
		return
	} else if err != nil && !sqlErrNotFound(err) {
		writeDetail(w, http.StatusInternalServerError, "注册失败")
		return
	}

	if payload.Phone != nil {
		var exists int
		if err := s.db.QueryRowContext(r.Context(), `SELECT 1 FROM users WHERE phone = ? LIMIT 1`, *payload.Phone).Scan(&exists); err == nil {
			writeDetail(w, http.StatusConflict, "手机号已被注册")
			return
		} else if err != nil && !sqlErrNotFound(err) {
			writeDetail(w, http.StatusInternalServerError, "注册失败")
			return
		}
	}
	if payload.Email != nil {
		var exists int
		if err := s.db.QueryRowContext(r.Context(), `SELECT 1 FROM users WHERE email = ? LIMIT 1`, *payload.Email).Scan(&exists); err == nil {
			writeDetail(w, http.StatusConflict, "邮箱已被注册")
			return
		} else if err != nil && !sqlErrNotFound(err) {
			writeDetail(w, http.StatusInternalServerError, "注册失败")
			return
		}
	}

	passwordHash, err := hashPassword(payload.Password)
	if err != nil {
		writeDetail(w, http.StatusInternalServerError, "注册失败")
		return
	}

	createdAt := currentTimestamp()
	result, err := s.db.ExecContext(
		r.Context(),
		`INSERT INTO users (username, nickname, phone, email, password_hash, is_banned, role, created_at) VALUES (?, ?, ?, ?, ?, 0, 'user', ?)`,
		payload.Username,
		payload.Nickname,
		payload.Phone,
		payload.Email,
		passwordHash,
		createdAt,
	)
	if err != nil {
		writeDetail(w, http.StatusInternalServerError, "注册失败")
		return
	}
	userID, err := result.LastInsertId()
	if err != nil {
		writeDetail(w, http.StatusInternalServerError, "注册失败")
		return
	}
	user, err := s.getUserByID(r.Context(), userID)
	if err != nil {
		writeDetail(w, http.StatusInternalServerError, "注册失败")
		return
	}
	token, err := s.createAccessToken(user.ID)
	if err != nil {
		writeDetail(w, http.StatusInternalServerError, "注册失败")
		return
	}
	writeJSON(w, http.StatusCreated, TokenResponse{
		AccessToken: token,
		TokenType:   "bearer",
		User:        userResponseFromRecord(user),
	})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var payload UserLoginRequest
	if err := decodeJSON(r, &payload); err != nil {
		writeDetail(w, http.StatusBadRequest, "请求格式错误")
		return
	}
	account := strings.TrimSpace(payload.Account)
	user, err := s.getUserByAccount(r.Context(), account)
	if err != nil || !verifyPassword(payload.Password, user.PasswordHash) {
		writeDetail(w, http.StatusUnauthorized, "账号或密码错误")
		return
	}
	token, err := s.createAccessToken(user.ID)
	if err != nil {
		writeDetail(w, http.StatusInternalServerError, "登录失败")
		return
	}
	writeJSON(w, http.StatusOK, TokenResponse{
		AccessToken: token,
		TokenType:   "bearer",
		User:        userResponseFromRecord(user),
	})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	user, err := s.currentUser(r)
	if err != nil {
		writeDetail(w, authErrorStatus(err.Error()), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, userResponseFromRecord(user))
}

func (s *Server) handleUserProfile(w http.ResponseWriter, r *http.Request) {
	username := strings.TrimSpace(r.PathValue("username"))
	user, err := s.getUserByUsername(r.Context(), username)
	if err != nil {
		writeDetail(w, http.StatusNotFound, "用户不存在")
		return
	}

	rows, err := s.db.QueryContext(r.Context(), `SELECT id, user_id, title, body, category, image_urls, view_count, status, ticket_status, created_at FROM posts WHERE user_id = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 30`, user.ID)
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
	if err := rows.Err(); err != nil {
		writeDetail(w, http.StatusInternalServerError, "加载失败")
		return
	}

	postReads, err := s.buildPostReads(r.Context(), posts, "")
	if err != nil {
		writeDetail(w, http.StatusInternalServerError, "加载失败")
		return
	}

	postList := make([]map[string]any, 0, len(postReads))
	for _, post := range postReads {
		postList = append(postList, map[string]any{
			"id":         post.ID,
			"title":      post.Title,
			"category":   post.Category,
			"created_at": post.CreatedAt,
			"view_count": post.ViewCount,
			"like_count": post.LikeCount,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"id":         user.ID,
		"username":   user.Username,
		"nickname":   user.Nickname,
		"created_at": normalizeTimestamp(user.CreatedAt),
		"post_count": len(postList),
		"posts":      postList,
	})
}
