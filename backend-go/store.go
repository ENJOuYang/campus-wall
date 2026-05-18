package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

type rowScanner interface {
	Scan(dest ...any) error
}

func scanUser(scanner rowScanner) (userRecord, error) {
	var user userRecord
	err := scanner.Scan(
		&user.ID,
		&user.Phone,
		&user.Email,
		&user.Username,
		&user.Nickname,
		&user.PasswordHash,
		&user.IsBanned,
		&user.Fingerprint,
		&user.Role,
		&user.CreatedAt,
	)
	return user, err
}

func scanPost(scanner rowScanner) (postRecord, error) {
	var post postRecord
	err := scanner.Scan(
		&post.ID,
		&post.UserID,
		&post.Title,
		&post.Body,
		&post.Category,
		&post.ImageURLsRaw,
		&post.ViewCount,
		&post.LikeCount,
		&post.Status,
		&post.TicketStatus,
		&post.CreatedAt,
	)
	return post, err
}

func scanComment(scanner rowScanner) (commentRecord, error) {
	var comment commentRecord
	err := scanner.Scan(
		&comment.ID,
		&comment.PostID,
		&comment.ParentID,
		&comment.UserID,
		&comment.Body,
		&comment.Fingerprint,
		&comment.CreatedAt,
	)
	return comment, err
}

func scanReport(scanner rowScanner) (reportRecord, error) {
	var report reportRecord
	err := scanner.Scan(
		&report.ID,
		&report.PostID,
		&report.UserID,
		&report.Reason,
		&report.Fingerprint,
		&report.CreatedAt,
		&report.Resolved,
		&report.ResolvedAt,
		&report.ResolvedBy,
	)
	return report, err
}

func scanNotification(scanner rowScanner) (notificationRecord, error) {
	var n notificationRecord
	err := scanner.Scan(
		&n.ID,
		&n.UserID,
		&n.Type,
		&n.PostID,
		&n.CommentID,
		&n.FromUserID,
		&n.IsRead,
		&n.CreatedAt,
	)
	return n, err
}

func (s *Server) getUserByID(ctx context.Context, id int64) (*userRecord, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, phone, email, username, nickname, password_hash, is_banned, fingerprint, role, created_at FROM users WHERE id = ?`, id)
	user, err := scanUser(row)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *Server) getUserByUsername(ctx context.Context, username string) (*userRecord, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, phone, email, username, nickname, password_hash, is_banned, fingerprint, role, created_at FROM users WHERE username = ?`, username)
	user, err := scanUser(row)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *Server) getUserByFingerprint(ctx context.Context, fingerprint string) (*userRecord, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, phone, email, username, nickname, password_hash, is_banned, fingerprint, role, created_at FROM users WHERE fingerprint = ?`, fingerprint)
	user, err := scanUser(row)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *Server) getUserByAccount(ctx context.Context, account string) (*userRecord, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, phone, email, username, nickname, password_hash, is_banned, fingerprint, role, created_at FROM users WHERE username = ? OR phone = ? OR email = ? LIMIT 1`, account, account, account)
	user, err := scanUser(row)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *Server) getPostByID(ctx context.Context, id int64) (*postRecord, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, user_id, title, body, category, image_urls, view_count, like_count, status, ticket_status, created_at FROM posts WHERE id = ?`, id)
	post, err := scanPost(row)
	if err != nil {
		return nil, err
	}
	return &post, nil
}

func (s *Server) getCommentByID(ctx context.Context, id int64) (*commentRecord, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, post_id, parent_id, user_id, body, fingerprint, created_at FROM comments WHERE id = ?`, id)
	comment, err := scanComment(row)
	if err != nil {
		return nil, err
	}
	return &comment, nil
}

func userResponseFromRecord(user *userRecord) UserResponse {
	return UserResponse{
		ID:        user.ID,
		Username:  user.Username,
		Nickname:  user.Nickname,
		Phone:     nullableString(sqlNullStringLike{String: user.Phone.String, Valid: user.Phone.Valid}),
		Email:     nullableString(sqlNullStringLike{String: user.Email.String, Valid: user.Email.Valid}),
		Role:      user.Role,
		CreatedAt: normalizeTimestamp(user.CreatedAt),
		IsBanned:  user.IsBanned,
	}
}

func (s *Server) buildPostReads(ctx context.Context, posts []postRecord, fingerprint string) ([]PostRead, error) {
	if len(posts) == 0 {
		return []PostRead{}, nil
	}

	postIDs := make([]int64, 0, len(posts))
	userIDs := make([]int64, 0)
	seenUsers := make(map[int64]bool)
	for _, post := range posts {
		postIDs = append(postIDs, post.ID)
		if post.UserID.Valid && !seenUsers[post.UserID.Int64] {
			userIDs = append(userIDs, post.UserID.Int64)
			seenUsers[post.UserID.Int64] = true
		}
	}

	authors := make(map[int64]AuthorInfo)
	if len(userIDs) > 0 {
		query := fmt.Sprintf("SELECT id, username, nickname FROM users WHERE id IN (%s)", placeholders(len(userIDs)))
		args := make([]any, len(userIDs))
		for i, id := range userIDs {
			args[i] = id
		}
		rows, err := s.db.QueryContext(ctx, query, args...)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		for rows.Next() {
			var id int64
			var username, nickname string
			if err := rows.Scan(&id, &username, &nickname); err != nil {
				return nil, err
			}
			authors[id] = AuthorInfo{Username: username, Nickname: nickname}
		}
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}

	likedPostIDs := make(map[int64]bool)
	if strings.TrimSpace(fingerprint) != "" {
		likedQuery := fmt.Sprintf("SELECT post_id FROM likes WHERE comment_id IS NULL AND fingerprint = ? AND post_id IN (%s)", placeholders(len(postIDs)))
		likedArgs := []any{fingerprint}
		for _, id := range postIDs {
			likedArgs = append(likedArgs, id)
		}
		rows, err := s.db.QueryContext(ctx, likedQuery, likedArgs...)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		for rows.Next() {
			var postID int64
			if err := rows.Scan(&postID); err != nil {
				return nil, err
			}
			likedPostIDs[postID] = true
		}
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}

	result := make([]PostRead, 0, len(posts))
	for _, post := range posts {
		var author *AuthorInfo
		if post.UserID.Valid {
			if info, ok := authors[post.UserID.Int64]; ok {
				infoCopy := info
				author = &infoCopy
			}
		}
		result = append(result, PostRead{
			ID:           post.ID,
			Title:        post.Title,
			Body:         post.Body,
			Category:     post.Category,
			CreatedAt:    normalizeTimestamp(post.CreatedAt),
			ImageURLs:    parseImageURLs(post.ImageURLsRaw.String),
			ViewCount:    post.ViewCount,
			LikeCount:    post.LikeCount,
			IsLiked:      likedPostIDs[post.ID],
			Status:       post.Status,
			TicketStatus: nullableString(sqlNullStringLike{String: post.TicketStatus.String, Valid: post.TicketStatus.Valid}),
			Author:       author,
		})
	}
	return result, nil
}

func (s *Server) buildPostRead(ctx context.Context, post postRecord, fingerprint string) (PostRead, error) {
	items, err := s.buildPostReads(ctx, []postRecord{post}, fingerprint)
	if err != nil {
		return PostRead{}, err
	}
	return items[0], nil
}

func encodeImageURLs(urls []string) string {
	if len(urls) == 0 {
		return ""
	}
	bytes, err := json.Marshal(urls)
	if err != nil {
		return ""
	}
	return string(bytes)
}

func sqlErrNotFound(err error) bool {
	return errors.Is(err, sql.ErrNoRows)
}
