package main

import (
	"fmt"
	"net/http"
)

func (s *Server) handleListNotifications(w http.ResponseWriter, r *http.Request) {
	user, err := s.optionalCurrentUser(r)
	if err != nil || user == nil {
		writeJSON(w, http.StatusOK, []NotificationRead{})
		return
	}
	rows, err := s.db.QueryContext(r.Context(), `SELECT id, user_id, type, post_id, comment_id, from_user_id, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`, user.ID)
	if err != nil {
		writeDetail(w, http.StatusInternalServerError, "加载失败")
		return
	}
	defer rows.Close()

	notifications := make([]notificationRecord, 0)
	fromUserIDs := make([]int64, 0)
	seen := make(map[int64]bool)
	for rows.Next() {
		notification, err := scanNotification(rows)
		if err != nil {
			writeDetail(w, http.StatusInternalServerError, "加载失败")
			return
		}
		notifications = append(notifications, notification)
		if notification.FromUserID.Valid && !seen[notification.FromUserID.Int64] {
			fromUserIDs = append(fromUserIDs, notification.FromUserID.Int64)
			seen[notification.FromUserID.Int64] = true
		}
	}

	fromUsers := make(map[int64]AuthorInfo)
	if len(fromUserIDs) > 0 {
		query := fmt.Sprintf("SELECT id, username, nickname FROM users WHERE id IN (%s)", placeholders(len(fromUserIDs)))
		args := make([]any, len(fromUserIDs))
		for i, id := range fromUserIDs {
			args[i] = id
		}
		userRows, err := s.db.QueryContext(r.Context(), query, args...)
		if err != nil {
			writeDetail(w, http.StatusInternalServerError, "加载失败")
			return
		}
		defer userRows.Close()
		for userRows.Next() {
			var id int64
			var username, nickname string
			if err := userRows.Scan(&id, &username, &nickname); err != nil {
				writeDetail(w, http.StatusInternalServerError, "加载失败")
				return
			}
			fromUsers[id] = AuthorInfo{Username: username, Nickname: nickname}
		}
	}

	result := make([]NotificationRead, 0, len(notifications))
	for _, notification := range notifications {
		var fromUsername *string
		var fromNickname *string
		if notification.FromUserID.Valid {
			if info, ok := fromUsers[notification.FromUserID.Int64]; ok {
				fromUsername = stringPointer(info.Username)
				fromNickname = stringPointer(info.Nickname)
			}
		}
		result = append(result, NotificationRead{
			ID:           notification.ID,
			Type:         notification.Type,
			PostID:       notification.PostID,
			FromUsername: fromUsername,
			FromNickname: fromNickname,
			IsRead:       notification.IsRead,
			CreatedAt:    normalizeTimestamp(notification.CreatedAt),
		})
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleUnreadCount(w http.ResponseWriter, r *http.Request) {
	user, err := s.optionalCurrentUser(r)
	if err != nil || user == nil {
		writeJSON(w, http.StatusOK, map[string]int{"count": 0})
		return
	}
	var count int
	if err := s.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0`, user.ID).Scan(&count); err != nil {
		writeJSON(w, http.StatusOK, map[string]int{"count": 0})
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"count": count})
}

func (s *Server) handleMarkNotificationRead(w http.ResponseWriter, r *http.Request) {
	user, err := s.currentUser(r)
	if err != nil {
		writeDetail(w, authErrorStatus(err.Error()), err.Error())
		return
	}
	notificationID, err := parsePathInt64(r, "notificationID")
	if err != nil {
		writeDetail(w, http.StatusBadRequest, "无效的通知 ID")
		return
	}
	var ownerID int64
	err = s.db.QueryRowContext(r.Context(), `SELECT user_id FROM notifications WHERE id = ?`, notificationID).Scan(&ownerID)
	if err != nil {
		writeDetail(w, http.StatusNotFound, "通知不存在")
		return
	}
	if ownerID != user.ID {
		writeDetail(w, http.StatusNotFound, "通知不存在")
		return
	}
	if _, err := s.db.ExecContext(r.Context(), `UPDATE notifications SET is_read = 1 WHERE id = ?`, notificationID); err != nil {
		writeDetail(w, http.StatusInternalServerError, "操作失败")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "已读"})
}

func (s *Server) handleMarkAllNotificationsRead(w http.ResponseWriter, r *http.Request) {
	user, err := s.currentUser(r)
	if err != nil {
		writeDetail(w, authErrorStatus(err.Error()), err.Error())
		return
	}
	if _, err := s.db.ExecContext(r.Context(), `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`, user.ID); err != nil {
		writeDetail(w, http.StatusInternalServerError, "操作失败")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "全部已读"})
}
