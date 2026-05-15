package app

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"mime"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
	"unicode"
)

const (
	maxDecodedImageBytes     = 32 * 1024 * 1024
	maxImageRequestBodyBytes = 44 * 1024 * 1024
)

var (
	ErrImageRequired = errors.New("image_required")
	ErrImageInvalid  = errors.New("image_invalid")
	ErrImageTooLarge = errors.New("image_too_large")
)

type StoredImage struct {
	AssetName string
	Source    string
	MimeType  string
	Path      string
	URI       string
	SizeBytes int
}

type FileImageStore struct {
	root string
}

func NewFileImageStore(root string) *FileImageStore {
	if root == "" {
		root = ".nomi/uploads"
	}
	return &FileImageStore{root: root}
}

func (s *FileImageStore) ResolveImagePath(relativePath string) (string, error) {
	clean := strings.TrimPrefix(filepath.Clean("/"+relativePath), "/")
	if clean == "." || clean == "" || strings.HasPrefix(clean, "..") {
		return "", ErrImageInvalid
	}

	root, err := filepath.Abs(s.root)
	if err != nil {
		return "", err
	}
	path, err := filepath.Abs(filepath.Join(root, clean))
	if err != nil {
		return "", err
	}
	if path != root && !strings.HasPrefix(path, root+string(os.PathSeparator)) {
		return "", ErrImageInvalid
	}
	return path, nil
}

func (s *FileImageStore) ResolveDisplayImagePath(relativePath string) (string, error) {
	path, err := s.ResolveImagePath(relativePath)
	if err != nil {
		return "", err
	}
	if isSidecarPreviewExt(filepath.Ext(path)) {
		convertedPath := strings.TrimSuffix(path, filepath.Ext(path)) + "-seedx.jpg"
		if _, err := os.Stat(convertedPath); err == nil {
			return convertedPath, nil
		}
	}
	return path, nil
}

func (s *FileImageStore) Save(_ context.Context, input ImageExtractionRequest) (StoredImage, error) {
	if input.ImageBase64 == "" {
		return StoredImage{}, ErrImageRequired
	}
	data, err := base64.StdEncoding.DecodeString(input.ImageBase64)
	if err != nil {
		return StoredImage{}, ErrImageInvalid
	}
	if len(data) == 0 {
		return StoredImage{}, ErrImageRequired
	}
	if len(data) > maxDecodedImageBytes {
		return StoredImage{}, ErrImageTooLarge
	}

	month := time.Now().UTC().Format("2006-01")
	dir := filepath.Join(s.root, month)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return StoredImage{}, err
	}

	fileName := storedImageFileName(input.AssetName, input.MimeType)
	path := filepath.Join(dir, fileName)
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return StoredImage{}, err
	}
	absPath, err := filepath.Abs(path)
	if err != nil {
		absPath = path
	}
	analysisPath := absPath
	if convertedPath, err := convertFileForAnalysis(input.MimeType, absPath); err == nil && convertedPath != "" {
		analysisPath = convertedPath
	}

	return StoredImage{
		AssetName: input.AssetName,
		Source:    input.Source,
		MimeType:  strings.ToLower(input.MimeType),
		Path:      analysisPath,
		URI:       "local://images/" + month + "/" + fileName,
		SizeBytes: len(data),
	}, nil
}

func storedImageFileName(assetName string, mimeType string) string {
	name := sanitizeAssetName(assetName)
	originalExt := filepath.Ext(name)
	ext := strings.ToLower(originalExt)
	if ext == "" {
		ext = extensionForMimeType(mimeType)
		name += ext
		originalExt = ext
	}
	stem := strings.TrimSuffix(name, originalExt)
	if stem == "" {
		stem = "upload"
	}
	return fmt.Sprintf("%s-%s-%s%s", time.Now().UTC().Format("20060102T150405.000000000"), randomSuffix(), stem, ext)
}

func convertFileForAnalysis(mimeType string, sourcePath string) (string, error) {
	normalizedMime := strings.ToLower(mimeType)
	ext := strings.ToLower(filepath.Ext(sourcePath))
	if normalizedMime != "image/heic" && normalizedMime != "application/pdf" && ext != ".heic" && ext != ".pdf" {
		return "", nil
	}

	outputPath := strings.TrimSuffix(sourcePath, filepath.Ext(sourcePath)) + "-seedx.jpg"
	cmd := exec.Command("sips", "-s", "format", "jpeg", sourcePath, "--out", outputPath)
	if output, err := cmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("preview_convert_failed: %w: %s", err, strings.TrimSpace(string(output)))
	}
	absPath, err := filepath.Abs(outputPath)
	if err != nil {
		return outputPath, nil
	}
	return absPath, nil
}

func isSidecarPreviewExt(ext string) bool {
	switch strings.ToLower(ext) {
	case ".heic", ".pdf":
		return true
	default:
		return false
	}
}

func sanitizeAssetName(name string) string {
	name = filepath.Base(strings.TrimSpace(name))
	if name == "." || name == "/" || name == "" {
		name = "upload"
	}
	var b strings.Builder
	for _, r := range name {
		switch {
		case unicode.IsLetter(r), unicode.IsDigit(r):
			b.WriteRune(r)
		case r == '.', r == '-', r == '_':
			b.WriteRune(r)
		default:
			b.WriteByte('-')
		}
		if b.Len() >= 96 {
			break
		}
	}
	out := strings.Trim(b.String(), ".-_")
	if out == "" {
		return "upload"
	}
	return out
}

func extensionForMimeType(mimeType string) string {
	extensions, err := mime.ExtensionsByType(strings.ToLower(mimeType))
	if err == nil && len(extensions) > 0 {
		return extensions[0]
	}
	return ".jpg"
}

func randomSuffix() string {
	var buf [4]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "00000000"
	}
	return fmt.Sprintf("%x", buf[:])
}
