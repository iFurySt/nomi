package app

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"mime"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode"
)

const (
	maxDecodedImageBytes     = 12 * 1024 * 1024
	maxImageRequestBodyBytes = 18 * 1024 * 1024
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

	return StoredImage{
		AssetName: input.AssetName,
		Source:    input.Source,
		MimeType:  strings.ToLower(input.MimeType),
		Path:      absPath,
		URI:       "local://images/" + month + "/" + fileName,
		SizeBytes: len(data),
	}, nil
}

func storedImageFileName(assetName string, mimeType string) string {
	name := sanitizeAssetName(assetName)
	ext := strings.ToLower(filepath.Ext(name))
	if ext == "" {
		ext = extensionForMimeType(mimeType)
		name += ext
	}
	stem := strings.TrimSuffix(name, ext)
	if stem == "" {
		stem = "upload"
	}
	return fmt.Sprintf("%s-%s-%s%s", time.Now().UTC().Format("20060102T150405.000000000"), randomSuffix(), stem, ext)
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
