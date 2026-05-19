package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	AppName          string
	DatabaseURL      string
	Port             string
	AdminToken       string
	JWTSecret        string
	JWTExpireMinutes int
	UploadDir        string
	RequireApproval  bool
	GateQuestion     string
	GateAnswer       string
	InviteSecret     string
}

func LoadConfig() (Config, error) {
	if err := loadDotEnv(".env"); err != nil {
		return Config{}, err
	}

	cfg := Config{
		AppName:          envString("APP_NAME", "DS 校园墙 API"),
		DatabaseURL:      envString("DATABASE_URL", "sqlite:///./data/campus_wall.db"),
		Port:             envString("PORT", ":8000"),
		AdminToken:       envString("ADMIN_TOKEN", ""),
		JWTSecret:        envString("JWT_SECRET", "9ca42e171723978a277d2b2a4c558dd3285b220661ceff084eba7f999d7df46a"),
		JWTExpireMinutes: envInt("JWT_EXPIRE_MINUTES", 60*24),
		UploadDir:        envString("UPLOAD_DIR", "./data/uploads"),
		RequireApproval:  envBool("REQUIRE_APPROVAL", false),
		GateQuestion:     envString("GATE_QUESTION", "ds 的中餐多少钱一份？"),
		GateAnswer:       envString("GATE_ANSWER", "13"),
		InviteSecret:     envString("INVITE_SECRET", ""),
	}
	if !strings.HasPrefix(cfg.Port, ":") {
		cfg.Port = ":" + cfg.Port
	}
	return cfg, nil
}

func loadDotEnv(path string) error {
	file, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("open %s: %w", path, err)
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if key == "" {
			continue
		}
		if _, exists := os.LookupEnv(key); exists {
			continue
		}
		value = strings.Trim(value, `"'`)
		if err := os.Setenv(key, value); err != nil {
			return fmt.Errorf("set env %s: %w", key, err)
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("scan %s: %w", path, err)
	}
	return nil
}

func envString(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func envInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func envBool(key string, fallback bool) bool {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	switch strings.ToLower(value) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
}
