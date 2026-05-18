package main

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite"
)

func openDatabase(cfg Config) (*sql.DB, error) {
	path := sqlitePath(cfg.DatabaseURL)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("mkdir db dir: %w", err)
	}

	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	if err := initializeDatabase(db); err != nil {
		_ = db.Close()
		return nil, err
	}
	return db, nil
}

func sqlitePath(databaseURL string) string {
	value := strings.TrimSpace(databaseURL)
	switch {
	case strings.HasPrefix(value, "sqlite:///"):
		return strings.TrimPrefix(value, "sqlite:///")
	case strings.HasPrefix(value, "sqlite://"):
		return strings.TrimPrefix(value, "sqlite://")
	default:
		return value
	}
}

func initializeDatabase(db *sql.DB) error {
	statements := []string{
		"PRAGMA foreign_keys = ON",
		"PRAGMA journal_mode = WAL",
		"PRAGMA busy_timeout = 5000",
		`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			phone TEXT UNIQUE,
			email TEXT UNIQUE,
			username TEXT NOT NULL UNIQUE,
			nickname TEXT NOT NULL,
			password_hash TEXT NOT NULL,
			is_banned BOOLEAN NOT NULL DEFAULT 0,
			fingerprint TEXT UNIQUE,
			role TEXT NOT NULL DEFAULT 'user',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS posts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
			title TEXT NOT NULL,
			body TEXT NOT NULL,
			category TEXT NOT NULL DEFAULT 'general',
			image_urls TEXT,
			view_count INTEGER NOT NULL DEFAULT 0,
			status TEXT NOT NULL DEFAULT 'approved',
			ticket_status TEXT,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS comments (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
			parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
			user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
			body TEXT NOT NULL,
			fingerprint TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS likes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
			comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
			user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
			fingerprint TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS notifications (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			type TEXT NOT NULL,
			post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
			comment_id INTEGER REFERENCES comments(id) ON DELETE SET NULL,
			from_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
			is_read BOOLEAN NOT NULL DEFAULT 0,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS reports (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
			user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
			reason TEXT NOT NULL,
			fingerprint TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			resolved BOOLEAN NOT NULL DEFAULT 0,
			resolved_at DATETIME,
			resolved_by TEXT
		)`,
	}

	for _, stmt := range statements {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("exec schema statement: %w", err)
		}
	}

	columns := []struct {
		table      string
		column     string
		definition string
	}{
		{"posts", "image_urls", "TEXT"},
		{"posts", "view_count", "INTEGER NOT NULL DEFAULT 0"},
		{"posts", "status", "TEXT NOT NULL DEFAULT 'approved'"},
		{"posts", "user_id", "INTEGER REFERENCES users(id) ON DELETE SET NULL"},
		{"posts", "ticket_status", "TEXT"},
		{"comments", "user_id", "INTEGER REFERENCES users(id) ON DELETE SET NULL"},
		{"comments", "parent_id", "INTEGER REFERENCES comments(id) ON DELETE CASCADE"},
		{"likes", "user_id", "INTEGER REFERENCES users(id) ON DELETE SET NULL"},
		{"likes", "comment_id", "INTEGER REFERENCES comments(id) ON DELETE CASCADE"},
		{"reports", "user_id", "INTEGER REFERENCES users(id) ON DELETE SET NULL"},
		{"users", "is_banned", "BOOLEAN NOT NULL DEFAULT 0"},
		{"users", "fingerprint", "TEXT UNIQUE"},
		{"users", "role", "TEXT NOT NULL DEFAULT 'user'"},
		{"notifications", "comment_id", "INTEGER REFERENCES comments(id) ON DELETE SET NULL"},
	}

	for _, column := range columns {
		if err := ensureColumn(db, column.table, column.column, column.definition); err != nil {
			return err
		}
	}

	indexes := []string{
		"CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id)",
		"CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id)",
		"CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id)",
		"CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id)",
		"CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes(post_id)",
		"CREATE INDEX IF NOT EXISTS idx_likes_comment_id ON likes(comment_id)",
		"CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes(user_id)",
		"CREATE INDEX IF NOT EXISTS idx_reports_post_id ON reports(post_id)",
		"CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id)",
		"CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)",
		"CREATE UNIQUE INDEX IF NOT EXISTS uq_post_fingerprint ON likes(post_id, fingerprint) WHERE comment_id IS NULL",
		"CREATE UNIQUE INDEX IF NOT EXISTS uq_comment_fingerprint ON likes(comment_id, fingerprint) WHERE comment_id IS NOT NULL",
	}

	for _, stmt := range indexes {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("exec index statement: %w", err)
		}
	}

	return nil
}

func ensureColumn(db *sql.DB, table, column, definition string) error {
	query := fmt.Sprintf("PRAGMA table_info(%s)", table)
	rows, err := db.Query(query)
	if err != nil {
		return fmt.Errorf("query table info %s: %w", table, err)
	}
	defer rows.Close()

	for rows.Next() {
		var (
			cid        int
			name       string
			dataType   string
			notNull    int
			defaultVal sql.NullString
			pk         int
		)
		if err := rows.Scan(&cid, &name, &dataType, &notNull, &defaultVal, &pk); err != nil {
			return fmt.Errorf("scan table info %s: %w", table, err)
		}
		if name == column {
			return nil
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate table info %s: %w", table, err)
	}

	alter := fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", table, column, definition)
	if _, err := db.ExecContext(context.Background(), alter); err != nil {
		return fmt.Errorf("add column %s.%s: %w", table, column, err)
	}
	return nil
}
