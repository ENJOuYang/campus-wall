package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type accessClaims struct {
	jwt.RegisteredClaims
}

func hashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

func verifyPassword(password, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

func (s *Server) createAccessToken(userID int64) (string, error) {
	claims := accessClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   strconv.FormatInt(userID, 10),
			ExpiresAt: jwt.NewNumericDate(time.Now().UTC().Add(time.Duration(s.cfg.JWTExpireMinutes) * time.Minute)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.cfg.JWTSecret))
}

func (s *Server) parseAccessToken(token string) (int64, error) {
	parsed, err := jwt.ParseWithClaims(token, &accessClaims{}, func(_ *jwt.Token) (any, error) {
		return []byte(s.cfg.JWTSecret), nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
	if err != nil {
		return 0, err
	}
	claims, ok := parsed.Claims.(*accessClaims)
	if !ok || !parsed.Valid {
		return 0, errors.New("invalid token")
	}
	userID, err := strconv.ParseInt(claims.Subject, 10, 64)
	if err != nil {
		return 0, err
	}
	return userID, nil
}

func extractBearerToken(header string) string {
	header = strings.TrimSpace(header)
	if header == "" {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(header, "Bearer"))
}

func (s *Server) optionalCurrentUser(r *http.Request) (*userRecord, error) {
	token := extractBearerToken(r.Header.Get("Authorization"))
	if token == "" {
		return nil, nil
	}
	userID, err := s.parseAccessToken(token)
	if err != nil {
		return nil, nil
	}
	user, err := s.getUserByID(r.Context(), userID)
	if err != nil {
		return nil, nil
	}
	return user, nil
}

func (s *Server) currentUser(r *http.Request) (*userRecord, error) {
	token := extractBearerToken(r.Header.Get("Authorization"))
	if token == "" {
		return nil, errors.New("未登录")
	}
	userID, err := s.parseAccessToken(token)
	if err != nil {
		return nil, errors.New("登录已过期，请重新登录")
	}
	user, err := s.getUserByID(r.Context(), userID)
	if err != nil {
		return nil, errors.New("用户不存在")
	}
	return user, nil
}

func (s *Server) adminRoleForToken(ctx context.Context, token string) (string, error) {
	if strings.TrimSpace(token) == "" {
		return "", nil
	}
	if s.cfg.AdminToken != "" && token == s.cfg.AdminToken {
		return "super_admin", nil
	}
	user, err := s.getUserByFingerprint(ctx, token)
	if err == nil && user.Role == "admin" {
		return "admin", nil
	}
	userID, err := s.parseAccessToken(token)
	if err != nil {
		return "", nil
	}
	adminUser, err := s.getUserByID(ctx, userID)
	if err != nil {
		return "", nil
	}
	if adminUser.Role == "admin" {
		return "admin", nil
	}
	return "", nil
}

func (s *Server) isAdminToken(ctx context.Context, token string) bool {
	role, err := s.adminRoleForToken(ctx, token)
	return err == nil && role != ""
}

func (s *Server) requireAdmin(r *http.Request) (string, error) {
	if s.cfg.AdminToken == "" {
		return "", errors.New("管理员功能未启用")
	}
	token := extractBearerToken(r.Header.Get("Authorization"))
	if token == "" {
		return "", errors.New("未提供管理员令牌")
	}
	role, err := s.adminRoleForToken(r.Context(), token)
	if err != nil {
		return "", err
	}
	if role == "" {
		return "", errors.New("管理员令牌无效或权限不足")
	}
	return role, nil
}

func (s *Server) requireSuperAdmin(r *http.Request) error {
	if s.cfg.AdminToken == "" {
		return errors.New("管理员功能未启用")
	}
	token := extractBearerToken(r.Header.Get("Authorization"))
	if token == "" {
		return errors.New("未提供管理员令牌")
	}
	if token != s.cfg.AdminToken {
		return errors.New("需要超级管理员权限")
	}
	return nil
}

func authErrorStatus(message string) int {
	switch message {
	case "未登录", "未提供管理员令牌":
		return http.StatusUnauthorized
	case "登录已过期，请重新登录", "用户不存在":
		return http.StatusUnauthorized
	case "管理员令牌无效或权限不足", "需要超级管理员权限":
		return http.StatusForbidden
	case "管理员功能未启用":
		return http.StatusForbidden
	default:
		return http.StatusUnauthorized
	}
}

func authError(message string, err error) error {
	if err == nil {
		return errors.New(message)
	}
	return fmt.Errorf("%s: %w", message, err)
}
