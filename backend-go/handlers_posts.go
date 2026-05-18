package main

import (
	"database/sql"
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

func (s *Server) handleListPosts(w http.ResponseWriter, r *http.Request) {
	queryParams := r.URL.Query()
	skip, _ := strconv.Atoi(queryParams.Get("skip"))
	if skip < 0 {
		skip = 0
	}
	limit, _ := strconv.Atoi(queryParams.Get("limit"))
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	sortBy := queryParams.Get("sort")
	if sortBy == "" {
		sortBy = "latest"
	}
	fingerprint := strings.TrimSpace(queryParams.Get("fingerprint"))
	category := strings.TrimSpace(queryParams.Get("category"))
	search := strings.TrimSpace(queryParams.Get("search"))

	filters := []string{"status = 'approved'"}
	args := make([]any, 0)
	if category != "" {
		filters = append(filters, "category = ?")
		args = append(args, category)
	}
	if search != "" {
		filters = append(filters, "(title LIKE ? OR body LIKE ?)")
		like := "%" + search + "%"
		args = append(args, like, like)
	}

	where := strings.Join(filters, " AND ")
	countQuery := "SELECT COUNT(*) FROM posts WHERE " + where
	var total int
	if err := s.db.QueryRowContext(r.Context(), countQuery, args...).Scan(&total); err != nil {
		writeDetail(w, http.StatusInternalServerError, "加载帖子失败")
		return
	}

	baseQuery := `SELECT p.id, p.user_id, p.title, p.body, p.category, p.image_urls, p.view_count, p.like_count, p.status, p.ticket_status, p.created_at
		FROM posts p`
	baseQuery += " WHERE " + where
	if sortBy == "hot" {
		baseQuery += " ORDER BY p.like_count DESC, p.created_at DESC"
	} else {
		baseQuery += " ORDER BY p.created_at DESC"
	}
	baseQuery += " LIMIT ? OFFSET ?"
	queryArgs := append(append([]any{}, args...), limit, skip)

	rows, err := s.db.QueryContext(r.Context(), baseQuery, queryArgs...)
	if err != nil {
		writeDetail(w, http.StatusInternalServerError, "加载帖子失败")
		return
	}
	defer rows.Close()

	posts := make([]postRecord, 0)
	for rows.Next() {
		post, err := scanPost(rows)
		if err != nil {
			writeDetail(w, http.StatusInternalServerError, "加载帖子失败")
			return
		}
		posts = append(posts, post)
	}
	if err := rows.Err(); err != nil {
		writeDetail(w, http.StatusInternalServerError, "加载帖子失败")
		return
	}

	items, err := s.buildPostReads(r.Context(), posts, fingerprint)
	if err != nil {
		writeDetail(w, http.StatusInternalServerError, "加载帖子失败")
		return
	}
	writeJSON(w, http.StatusOK, PostListResponse{Items: items, Total: total})
}

func (s *Server) handleGetPost(w http.ResponseWriter, r *http.Request) {
	postID, err := parsePathInt64(r, "postID")
	if err != nil {
		writeDetail(w, http.StatusBadRequest, "无效的帖子 ID")
		return
	}
	post, err := s.getPostByID(r.Context(), postID)
	if err != nil || post.Status == "rejected" {
		writeDetail(w, http.StatusNotFound, "帖子不存在")
		return
	}
	postRead, err := s.buildPostRead(r.Context(), *post, strings.TrimSpace(r.URL.Query().Get("fingerprint")))
	if err != nil {
		writeDetail(w, http.StatusInternalServerError, "加载帖子失败")
		return
	}
	writeJSON(w, http.StatusOK, postRead)
}

func (s *Server) handleDeletePost(w http.ResponseWriter, r *http.Request) {
	postID, err := parsePathInt64(r, "postID")
	if err != nil {
		writeDetail(w, http.StatusBadRequest, "无效的帖子 ID")
		return
	}
	user, err := s.currentUser(r)
	if err != nil {
		writeDetail(w, authErrorStatus(err.Error()), err.Error())
		return
	}
	post, err := s.getPostByID(r.Context(), postID)
	if err != nil {
		writeDetail(w, http.StatusNotFound, "帖子不存在")
		return
	}
	if !post.UserID.Valid || post.UserID.Int64 != user.ID {
		writeDetail(w, http.StatusForbidden, "仅可删除自己的帖子")
		return
	}
	if _, err := s.db.ExecContext(r.Context(), `DELETE FROM posts WHERE id = ?`, postID); err != nil {
		writeDetail(w, http.StatusInternalServerError, "删除失败")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "帖子已删除"})
}

func (s *Server) handleCreatePost(w http.ResponseWriter, r *http.Request) {
	var payload PostCreateRequest
	if err := decodeJSON(r, &payload); err != nil {
		writeDetail(w, http.StatusBadRequest, "请求格式错误")
		return
	}
	payload.Title = strings.TrimSpace(payload.Title)
	payload.Body = strings.TrimSpace(payload.Body)
	payload.Category = strings.TrimSpace(payload.Category)
	if payload.Category == "" {
		payload.Category = "general"
	}
	if payload.Title == "" || payload.Body == "" {
		writeDetail(w, http.StatusBadRequest, "请填写标题与正文")
		return
	}

	adminToken := extractBearerToken(r.Header.Get("Authorization"))
	currentUser, _ := s.optionalCurrentUser(r)
	if currentUser == nil && !s.isAdminToken(r.Context(), adminToken) {
		writeDetail(w, http.StatusUnauthorized, "请先登录后再发帖")
		return
	}
	if currentUser != nil && currentUser.IsBanned {
		writeDetail(w, http.StatusForbidden, "您的账号已被封禁，无法发帖")
		return
	}
	if payload.Category == "notice" && !s.isAdminToken(r.Context(), adminToken) {
		writeDetail(w, http.StatusForbidden, "仅管理员可发布公告")
		return
	}

	status := "approved"
	if s.cfg.RequireApproval {
		status = "pending"
	}
	var userID any = nil
	if currentUser != nil && !payload.Anonymous {
		userID = currentUser.ID
	}
	ticketStatus := sql.NullString{}
	if payload.Category == "ticket" {
		ticketStatus = sql.NullString{String: "open", Valid: true}
	}
	createdAt := currentTimestamp()
	result, err := s.db.ExecContext(
		r.Context(),
		`INSERT INTO posts (user_id, title, body, category, image_urls, view_count, status, ticket_status, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
		userID,
		payload.Title,
		payload.Body,
		payload.Category,
		encodeImageURLs(payload.ImageURLs),
		status,
		ticketStatus,
		createdAt,
	)
	if err != nil {
		writeDetail(w, http.StatusInternalServerError, "发帖失败")
		return
	}
	postID, err := result.LastInsertId()
	if err != nil {
		writeDetail(w, http.StatusInternalServerError, "发帖失败")
		return
	}
	post, err := s.getPostByID(r.Context(), postID)
	if err != nil {
		writeDetail(w, http.StatusInternalServerError, "发帖失败")
		return
	}
	postRead, err := s.buildPostRead(r.Context(), *post, "")
	if err != nil {
		writeDetail(w, http.StatusInternalServerError, "发帖失败")
		return
	}
	writeJSON(w, http.StatusCreated, postRead)
}

func (s *Server) handleIncrementView(w http.ResponseWriter, r *http.Request) {
	postID, err := parsePathInt64(r, "postID")
	if err != nil {
		writeDetail(w, http.StatusBadRequest, "无效的帖子 ID")
		return
	}
	result, err := s.db.ExecContext(r.Context(), `UPDATE posts SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ?`, postID)
	if err != nil {
		writeDetail(w, http.StatusInternalServerError, "操作失败")
		return
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		writeDetail(w, http.StatusNotFound, "帖子不存在")
		return
	}
	var viewCount int
	if err := s.db.QueryRowContext(r.Context(), `SELECT view_count FROM posts WHERE id = ?`, postID).Scan(&viewCount); err != nil {
		writeDetail(w, http.StatusInternalServerError, "操作失败")
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"view_count": viewCount})
}

func (s *Server) handleTogglePostLike(w http.ResponseWriter, r *http.Request) {
	postID, err := parsePathInt64(r, "postID")
	if err != nil {
		writeDetail(w, http.StatusBadRequest, "无效的帖子 ID")
		return
	}
	var payload LikeCreateRequest
	if err := decodeJSON(r, &payload); err != nil || strings.TrimSpace(payload.Fingerprint) == "" {
		writeDetail(w, http.StatusBadRequest, "请求格式错误")
		return
	}
	post, err := s.getPostByID(r.Context(), postID)
	if err != nil || post.Status == "rejected" {
		writeDetail(w, http.StatusNotFound, "帖子不存在")
		return
	}
	currentUser, _ := s.optionalCurrentUser(r)

	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeDetail(w, http.StatusInternalServerError, "操作失败")
		return
	}
	defer tx.Rollback()

	var existingID int64
	err = tx.QueryRowContext(r.Context(), `SELECT id FROM likes WHERE post_id = ? AND comment_id IS NULL AND fingerprint = ? LIMIT 1`, postID, payload.Fingerprint).Scan(&existingID)
	if err != nil && !sqlErrNotFound(err) {
		writeDetail(w, http.StatusInternalServerError, "操作失败")
		return
	}
	if sqlErrNotFound(err) && currentUser != nil {
		err = tx.QueryRowContext(r.Context(), `SELECT id FROM likes WHERE post_id = ? AND comment_id IS NULL AND user_id = ? LIMIT 1`, postID, currentUser.ID).Scan(&existingID)
		if err != nil && !sqlErrNotFound(err) {
			writeDetail(w, http.StatusInternalServerError, "操作失败")
			return
		}
	}

	liked := true
	if existingID != 0 {
		if _, err := tx.ExecContext(r.Context(), `DELETE FROM likes WHERE id = ?`, existingID); err != nil {
			writeDetail(w, http.StatusInternalServerError, "操作失败")
			return
		}
		if _, err := tx.ExecContext(r.Context(), `UPDATE posts SET like_count = CASE WHEN like_count > 0 THEN like_count - 1 ELSE 0 END WHERE id = ?`, postID); err != nil {
			writeDetail(w, http.StatusInternalServerError, "操作失败")
			return
		}
		liked = false
	} else {
		var userID any = nil
		if currentUser != nil {
			userID = currentUser.ID
		}
		if _, err := tx.ExecContext(r.Context(), `INSERT INTO likes (post_id, comment_id, user_id, fingerprint, created_at) VALUES (?, NULL, ?, ?, ?)`, postID, userID, payload.Fingerprint, currentTimestamp()); err != nil {
			writeDetail(w, http.StatusInternalServerError, "操作失败")
			return
		}
		if _, err := tx.ExecContext(r.Context(), `UPDATE posts SET like_count = like_count + 1 WHERE id = ?`, postID); err != nil {
			writeDetail(w, http.StatusInternalServerError, "操作失败")
			return
		}
		if currentUser != nil && post.UserID.Valid && post.UserID.Int64 != currentUser.ID {
			if _, err := tx.ExecContext(r.Context(), `INSERT INTO notifications (user_id, type, post_id, from_user_id, is_read, created_at) VALUES (?, 'like', ?, ?, 0, ?)`, post.UserID.Int64, postID, currentUser.ID, currentTimestamp()); err != nil {
				writeDetail(w, http.StatusInternalServerError, "操作失败")
				return
			}
		}
	}

	var likeCount int
	if err := tx.QueryRowContext(r.Context(), `SELECT like_count FROM posts WHERE id = ?`, postID).Scan(&likeCount); err != nil {
		writeDetail(w, http.StatusInternalServerError, "操作失败")
		return
	}
	if err := tx.Commit(); err != nil {
		writeDetail(w, http.StatusInternalServerError, "操作失败")
		return
	}
	writeJSON(w, http.StatusOK, LikeToggleResponse{Liked: liked, LikeCount: likeCount})
}

func (s *Server) handleToggleCommentLike(w http.ResponseWriter, r *http.Request) {
	postID, err := parsePathInt64(r, "postID")
	if err != nil {
		writeDetail(w, http.StatusBadRequest, "无效的帖子 ID")
		return
	}
	commentID, err := parsePathInt64(r, "commentID")
	if err != nil {
		writeDetail(w, http.StatusBadRequest, "无效的评论 ID")
		return
	}
	var payload LikeCreateRequest
	if err := decodeJSON(r, &payload); err != nil || strings.TrimSpace(payload.Fingerprint) == "" {
		writeDetail(w, http.StatusBadRequest, "请求格式错误")
		return
	}
	comment, err := s.getCommentByID(r.Context(), commentID)
	if err != nil || comment.PostID != postID {
		writeDetail(w, http.StatusNotFound, "评论不存在")
		return
	}
	currentUser, _ := s.optionalCurrentUser(r)

	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeDetail(w, http.StatusInternalServerError, "操作失败")
		return
	}
	defer tx.Rollback()

	var existingID int64
	err = tx.QueryRowContext(r.Context(), `SELECT id FROM likes WHERE comment_id = ? AND fingerprint = ? LIMIT 1`, commentID, payload.Fingerprint).Scan(&existingID)
	if err != nil && !sqlErrNotFound(err) {
		writeDetail(w, http.StatusInternalServerError, "操作失败")
		return
	}
	if sqlErrNotFound(err) && currentUser != nil {
		err = tx.QueryRowContext(r.Context(), `SELECT id FROM likes WHERE comment_id = ? AND user_id = ? LIMIT 1`, commentID, currentUser.ID).Scan(&existingID)
		if err != nil && !sqlErrNotFound(err) {
			writeDetail(w, http.StatusInternalServerError, "操作失败")
			return
		}
	}

	liked := true
	if existingID != 0 {
		if _, err := tx.ExecContext(r.Context(), `DELETE FROM likes WHERE id = ?`, existingID); err != nil {
			writeDetail(w, http.StatusInternalServerError, "操作失败")
			return
		}
		liked = false
	} else {
		var userID any = nil
		if currentUser != nil {
			userID = currentUser.ID
		}
		if _, err := tx.ExecContext(r.Context(), `INSERT INTO likes (post_id, comment_id, user_id, fingerprint, created_at) VALUES (NULL, ?, ?, ?, ?)`, commentID, userID, payload.Fingerprint, currentTimestamp()); err != nil {
			writeDetail(w, http.StatusInternalServerError, "操作失败")
			return
		}
		if currentUser != nil && comment.UserID.Valid && comment.UserID.Int64 != currentUser.ID {
			if _, err := tx.ExecContext(r.Context(), `INSERT INTO notifications (user_id, type, post_id, comment_id, from_user_id, is_read, created_at) VALUES (?, 'comment_like', ?, ?, ?, 0, ?)`, comment.UserID.Int64, postID, commentID, currentUser.ID, currentTimestamp()); err != nil {
				writeDetail(w, http.StatusInternalServerError, "操作失败")
				return
			}
		}
	}

	var likeCount int
	if err := tx.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM likes WHERE comment_id = ?`, commentID).Scan(&likeCount); err != nil {
		writeDetail(w, http.StatusInternalServerError, "操作失败")
		return
	}
	if err := tx.Commit(); err != nil {
		writeDetail(w, http.StatusInternalServerError, "操作失败")
		return
	}
	writeJSON(w, http.StatusOK, LikeToggleResponse{Liked: liked, LikeCount: likeCount})
}

func (s *Server) handleListComments(w http.ResponseWriter, r *http.Request) {
	postID, err := parsePathInt64(r, "postID")
	if err != nil {
		writeDetail(w, http.StatusBadRequest, "无效的帖子 ID")
		return
	}
	post, err := s.getPostByID(r.Context(), postID)
	if err != nil || post.Status == "rejected" {
		writeDetail(w, http.StatusNotFound, "帖子不存在")
		return
	}

	rows, err := s.db.QueryContext(r.Context(), `SELECT id, post_id, parent_id, user_id, body, fingerprint, created_at FROM comments WHERE post_id = ? ORDER BY created_at ASC`, postID)
	if err != nil {
		writeDetail(w, http.StatusInternalServerError, "加载评论失败")
		return
	}
	defer rows.Close()

	comments := make([]commentRecord, 0)
	commentIDs := make([]int64, 0)
	userIDs := make([]int64, 0)
	seenUsers := make(map[int64]bool)
	for rows.Next() {
		comment, err := scanComment(rows)
		if err != nil {
			writeDetail(w, http.StatusInternalServerError, "加载评论失败")
			return
		}
		comments = append(comments, comment)
		commentIDs = append(commentIDs, comment.ID)
		if comment.UserID.Valid && !seenUsers[comment.UserID.Int64] {
			userIDs = append(userIDs, comment.UserID.Int64)
			seenUsers[comment.UserID.Int64] = true
		}
	}
	if err := rows.Err(); err != nil {
		writeDetail(w, http.StatusInternalServerError, "加载评论失败")
		return
	}

	authors := make(map[int64]AuthorInfo)
	if len(userIDs) > 0 {
		query := fmt.Sprintf("SELECT id, username, nickname FROM users WHERE id IN (%s)", placeholders(len(userIDs)))
		args := make([]any, len(userIDs))
		for i, id := range userIDs {
			args[i] = id
		}
		userRows, err := s.db.QueryContext(r.Context(), query, args...)
		if err != nil {
			writeDetail(w, http.StatusInternalServerError, "加载评论失败")
			return
		}
		defer userRows.Close()
		for userRows.Next() {
			var id int64
			var username, nickname string
			if err := userRows.Scan(&id, &username, &nickname); err != nil {
				writeDetail(w, http.StatusInternalServerError, "加载评论失败")
				return
			}
			authors[id] = AuthorInfo{Username: username, Nickname: nickname}
		}
		if err := userRows.Err(); err != nil {
			writeDetail(w, http.StatusInternalServerError, "加载评论失败")
			return
		}
	}

	likeCounts := make(map[int64]int)
	likedSet := make(map[int64]bool)
	if len(commentIDs) > 0 {
		query := fmt.Sprintf("SELECT comment_id, COUNT(*) FROM likes WHERE comment_id IN (%s) GROUP BY comment_id", placeholders(len(commentIDs)))
		args := make([]any, len(commentIDs))
		for i, id := range commentIDs {
			args[i] = id
		}
		likeRows, err := s.db.QueryContext(r.Context(), query, args...)
		if err != nil {
			writeDetail(w, http.StatusInternalServerError, "加载评论失败")
			return
		}
		defer likeRows.Close()
		for likeRows.Next() {
			var commentID int64
			var count int
			if err := likeRows.Scan(&commentID, &count); err != nil {
				writeDetail(w, http.StatusInternalServerError, "加载评论失败")
				return
			}
			likeCounts[commentID] = count
		}
		if err := likeRows.Err(); err != nil {
			writeDetail(w, http.StatusInternalServerError, "加载评论失败")
			return
		}

		fingerprint := strings.TrimSpace(r.URL.Query().Get("fingerprint"))
		if fingerprint != "" {
			query := fmt.Sprintf("SELECT comment_id FROM likes WHERE fingerprint = ? AND comment_id IN (%s)", placeholders(len(commentIDs)))
			args := []any{fingerprint}
			for _, id := range commentIDs {
				args = append(args, id)
			}
			likedRows, err := s.db.QueryContext(r.Context(), query, args...)
			if err != nil {
				writeDetail(w, http.StatusInternalServerError, "加载评论失败")
				return
			}
			defer likedRows.Close()
			for likedRows.Next() {
				var commentID int64
				if err := likedRows.Scan(&commentID); err != nil {
					writeDetail(w, http.StatusInternalServerError, "加载评论失败")
					return
				}
				likedSet[commentID] = true
			}
			if err := likedRows.Err(); err != nil {
				writeDetail(w, http.StatusInternalServerError, "加载评论失败")
				return
			}
		}
	}

	itemsByID := make(map[int64]CommentRead)
	children := make(map[int64][]int64)
	rootIDs := make([]int64, 0)
	for _, comment := range comments {
		var author *AuthorInfo
		if comment.UserID.Valid {
			if info, ok := authors[comment.UserID.Int64]; ok {
				infoCopy := info
				author = &infoCopy
			}
		}
		var parentID *int64
		if comment.ParentID.Valid {
			value := comment.ParentID.Int64
			parentID = &value
			children[value] = append(children[value], comment.ID)
		} else {
			rootIDs = append(rootIDs, comment.ID)
		}
		itemsByID[comment.ID] = CommentRead{
			ID:          comment.ID,
			PostID:      comment.PostID,
			Body:        comment.Body,
			Fingerprint: comment.Fingerprint,
			CreatedAt:   normalizeTimestamp(comment.CreatedAt),
			Author:      author,
			ParentID:    parentID,
			Replies:     []CommentRead{},
			LikeCount:   likeCounts[comment.ID],
			IsLiked:     likedSet[comment.ID],
		}
	}

	var buildTree func(id int64) CommentRead
	buildTree = func(id int64) CommentRead {
		item := itemsByID[id]
		for _, childID := range children[id] {
			item.Replies = append(item.Replies, buildTree(childID))
		}
		return item
	}

	result := make([]CommentRead, 0, len(rootIDs))
	for _, rootID := range rootIDs {
		result = append(result, buildTree(rootID))
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleCreateComment(w http.ResponseWriter, r *http.Request) {
	postID, err := parsePathInt64(r, "postID")
	if err != nil {
		writeDetail(w, http.StatusBadRequest, "无效的帖子 ID")
		return
	}
	var payload CommentCreateRequest
	if err := decodeJSON(r, &payload); err != nil || strings.TrimSpace(payload.Body) == "" || strings.TrimSpace(payload.Fingerprint) == "" {
		writeDetail(w, http.StatusBadRequest, "请求格式错误")
		return
	}
	currentUser, _ := s.optionalCurrentUser(r)
	if currentUser != nil && currentUser.IsBanned {
		writeDetail(w, http.StatusForbidden, "您的账号已被封禁，无法评论")
		return
	}
	post, err := s.getPostByID(r.Context(), postID)
	if err != nil || post.Status == "rejected" {
		writeDetail(w, http.StatusNotFound, "帖子不存在")
		return
	}

	var parentComment *commentRecord
	if payload.ParentID != nil {
		parentComment, err = s.getCommentByID(r.Context(), *payload.ParentID)
		if err != nil || parentComment.PostID != postID {
			writeDetail(w, http.StatusNotFound, "父评论不存在或不属于该帖子")
			return
		}
	}

	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		writeDetail(w, http.StatusInternalServerError, "评论失败")
		return
	}
	defer tx.Rollback()

	var userID any = nil
	if currentUser != nil {
		userID = currentUser.ID
	}
	result, err := tx.ExecContext(
		r.Context(),
		`INSERT INTO comments (post_id, parent_id, user_id, body, fingerprint, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		postID,
		payload.ParentID,
		userID,
		strings.TrimSpace(payload.Body),
		payload.Fingerprint,
		currentTimestamp(),
	)
	if err != nil {
		writeDetail(w, http.StatusInternalServerError, "评论失败")
		return
	}
	commentID, err := result.LastInsertId()
	if err != nil {
		writeDetail(w, http.StatusInternalServerError, "评论失败")
		return
	}

	if currentUser != nil && payload.ParentID == nil && post.UserID.Valid && post.UserID.Int64 != currentUser.ID {
		if _, err := tx.ExecContext(r.Context(), `INSERT INTO notifications (user_id, type, post_id, from_user_id, is_read, created_at) VALUES (?, 'comment', ?, ?, 0, ?)`, post.UserID.Int64, postID, currentUser.ID, currentTimestamp()); err != nil {
			writeDetail(w, http.StatusInternalServerError, "评论失败")
			return
		}
	}
	if currentUser != nil && parentComment != nil && parentComment.UserID.Valid && parentComment.UserID.Int64 != currentUser.ID {
		if _, err := tx.ExecContext(r.Context(), `INSERT INTO notifications (user_id, type, post_id, comment_id, from_user_id, is_read, created_at) VALUES (?, 'reply', ?, ?, ?, 0, ?)`, parentComment.UserID.Int64, postID, parentComment.ID, currentUser.ID, currentTimestamp()); err != nil {
			writeDetail(w, http.StatusInternalServerError, "评论失败")
			return
		}
	}

	if err := tx.Commit(); err != nil {
		writeDetail(w, http.StatusInternalServerError, "评论失败")
		return
	}

	comment, err := s.getCommentByID(r.Context(), commentID)
	if err != nil {
		writeDetail(w, http.StatusInternalServerError, "评论失败")
		return
	}
	var author *AuthorInfo
	if currentUser != nil {
		author = &AuthorInfo{Username: currentUser.Username, Nickname: currentUser.Nickname}
	}
	var parentID *int64
	if comment.ParentID.Valid {
		value := comment.ParentID.Int64
		parentID = &value
	}
	writeJSON(w, http.StatusCreated, CommentRead{
		ID:          comment.ID,
		PostID:      comment.PostID,
		Body:        comment.Body,
		Fingerprint: comment.Fingerprint,
		CreatedAt:   normalizeTimestamp(comment.CreatedAt),
		Author:      author,
		ParentID:    parentID,
		Replies:     []CommentRead{},
		LikeCount:   0,
		IsLiked:     false,
	})
}

func (s *Server) handleDeleteComment(w http.ResponseWriter, r *http.Request) {
	postID, err := parsePathInt64(r, "postID")
	if err != nil {
		writeDetail(w, http.StatusBadRequest, "无效的帖子 ID")
		return
	}
	commentID, err := parsePathInt64(r, "commentID")
	if err != nil {
		writeDetail(w, http.StatusBadRequest, "无效的评论 ID")
		return
	}
	currentUser, err := s.currentUser(r)
	if err != nil {
		writeDetail(w, authErrorStatus(err.Error()), err.Error())
		return
	}
	comment, err := s.getCommentByID(r.Context(), commentID)
	if err != nil || comment.PostID != postID {
		writeDetail(w, http.StatusNotFound, "评论不存在")
		return
	}
	if (!comment.UserID.Valid || comment.UserID.Int64 != currentUser.ID) && currentUser.Role != "admin" {
		writeDetail(w, http.StatusForbidden, "仅可删除自己的评论")
		return
	}
	if _, err := s.db.ExecContext(r.Context(), `DELETE FROM comments WHERE id = ?`, commentID); err != nil {
		writeDetail(w, http.StatusInternalServerError, "删除失败")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "评论已删除"})
}

func (s *Server) handleCreateReport(w http.ResponseWriter, r *http.Request) {
	postID, err := parsePathInt64(r, "postID")
	if err != nil {
		writeDetail(w, http.StatusBadRequest, "无效的帖子 ID")
		return
	}
	var payload ReportCreateRequest
	if err := decodeJSON(r, &payload); err != nil || strings.TrimSpace(payload.Reason) == "" || strings.TrimSpace(payload.Fingerprint) == "" {
		writeDetail(w, http.StatusBadRequest, "请求格式错误")
		return
	}
	if _, err := s.getPostByID(r.Context(), postID); err != nil {
		writeDetail(w, http.StatusNotFound, "帖子不存在")
		return
	}
	currentUser, _ := s.optionalCurrentUser(r)
	var userID any = nil
	if currentUser != nil {
		userID = currentUser.ID
	}
	if _, err := s.db.ExecContext(r.Context(), `INSERT INTO reports (post_id, user_id, reason, fingerprint, created_at, resolved) VALUES (?, ?, ?, ?, ?, 0)`, postID, userID, strings.TrimSpace(payload.Reason), payload.Fingerprint, currentTimestamp()); err != nil {
		writeDetail(w, http.StatusInternalServerError, "举报失败")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"message": "举报已提交"})
}
