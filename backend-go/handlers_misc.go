package main

import (
	"crypto/rand"
	"encoding/hex"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

var allowedExtensions = map[string]bool{
	".jpg":  true,
	".jpeg": true,
	".png":  true,
	".gif":  true,
	".webp": true,
}

const maxUploadSize = 5 * 1024 * 1024

func (s *Server) handleUpload(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize+1024)
	file, header, err := r.FormFile("file")
	if err != nil {
		writeDetail(w, http.StatusBadRequest, "图片上传失败")
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if !allowedExtensions[ext] {
		writeDetail(w, http.StatusBadRequest, "不支持的文件类型: "+ext)
		return
	}

	content, err := readLimited(file, maxUploadSize)
	if err != nil {
		writeDetail(w, http.StatusBadRequest, err.Error())
		return
	}

	name, err := randomHex(16)
	if err != nil {
		writeDetail(w, http.StatusInternalServerError, "图片上传失败")
		return
	}

	filename := name + ext
	path := filepath.Join(s.cfg.UploadDir, filename)
	if err := os.WriteFile(path, content, 0o644); err != nil {
		writeDetail(w, http.StatusInternalServerError, "图片上传失败")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"url": "/api/uploads/" + filename,
	})
}

func readLimited(file multipart.File, limit int64) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(file, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, &uploadSizeError{}
	}
	return data, nil
}

type uploadSizeError struct{}

func (e *uploadSizeError) Error() string {
	return "文件大小超过 5MB 限制"
}

func randomHex(size int) (string, error) {
	bytes := make([]byte, size)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}
