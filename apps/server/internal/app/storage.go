package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

const maxAssetBytes int64 = 64 * 1024 * 1024

type StoragePutResult struct {
	Key       string
	SizeBytes int64
	SHA256    string
}

type StorageProvider interface {
	Name() string
	Put(context.Context, string, io.Reader) (StoragePutResult, error)
	Open(context.Context, string) (io.ReadCloser, error)
	Delete(context.Context, string) error
}

type FSStorage struct{ root string }

func NewFSStorage(root string) *FSStorage { return &FSStorage{root: root} }
func (s *FSStorage) Name() string         { return "fs" }

func (s *FSStorage) resolve(key string) (string, error) {
	clean := filepath.Clean(key)
	if clean == "." || filepath.IsAbs(clean) || strings.HasPrefix(clean, ".."+string(filepath.Separator)) || clean == ".." {
		return "", errors.New("invalid_storage_key")
	}
	root, err := filepath.Abs(s.root)
	if err != nil {
		return "", err
	}
	path, err := filepath.Abs(filepath.Join(root, clean))
	if err != nil {
		return "", err
	}
	if path != root && !strings.HasPrefix(path, root+string(filepath.Separator)) {
		return "", errors.New("invalid_storage_key")
	}
	return path, nil
}

func (s *FSStorage) Put(ctx context.Context, key string, source io.Reader) (StoragePutResult, error) {
	path, err := s.resolve(key)
	if err != nil {
		return StoragePutResult{}, err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return StoragePutResult{}, err
	}
	temp, err := os.CreateTemp(filepath.Dir(path), ".nomi-upload-*")
	if err != nil {
		return StoragePutResult{}, err
	}
	tempPath := temp.Name()
	defer os.Remove(tempPath)
	hash := sha256.New()
	limited := io.LimitReader(source, maxAssetBytes+1)
	written, copyErr := io.Copy(io.MultiWriter(temp, hash), limited)
	closeErr := temp.Close()
	if copyErr != nil {
		return StoragePutResult{}, copyErr
	}
	if closeErr != nil {
		return StoragePutResult{}, closeErr
	}
	if written > maxAssetBytes {
		return StoragePutResult{}, errors.New("asset_too_large")
	}
	select {
	case <-ctx.Done():
		return StoragePutResult{}, ctx.Err()
	default:
	}
	if err := os.Chmod(tempPath, 0o600); err != nil {
		return StoragePutResult{}, err
	}
	if err := os.Rename(tempPath, path); err != nil {
		return StoragePutResult{}, err
	}
	return StoragePutResult{Key: key, SizeBytes: written, SHA256: hex.EncodeToString(hash.Sum(nil))}, nil
}

func (s *FSStorage) Open(_ context.Context, key string) (io.ReadCloser, error) {
	path, err := s.resolve(key)
	if err != nil {
		return nil, err
	}
	return os.Open(path)
}
func (s *FSStorage) Delete(_ context.Context, key string) error {
	path, err := s.resolve(key)
	if err != nil {
		return err
	}
	err = os.Remove(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

var unsafeFilename = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)

func safeFilename(value string) string {
	value = filepath.Base(strings.TrimSpace(value))
	value = unsafeFilename.ReplaceAllString(value, "-")
	value = strings.Trim(value, "-.")
	if value == "" {
		return "asset.bin"
	}
	if len(value) > 120 {
		ext := filepath.Ext(value)
		value = strings.TrimSuffix(value, ext)
		if len(value) > 100 {
			value = value[:100]
		}
		value += ext
	}
	return value
}
func assetStorageKey(householdID, assetID, originalName string) string {
	return filepath.ToSlash(filepath.Join("households", householdID, "assets", fmt.Sprintf("%s-%s", assetID, safeFilename(originalName))))
}
