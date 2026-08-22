package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type WorkspaceManager struct {
	containerRoot string
	agentRoot     string
	storage       StorageProvider
}

func NewWorkspaceManager(containerRoot, agentRoot string, storage StorageProvider) *WorkspaceManager {
	if agentRoot == "" {
		agentRoot = containerRoot
	}
	return &WorkspaceManager{containerRoot: containerRoot, agentRoot: agentRoot, storage: storage}
}

func (m *WorkspaceManager) paths(householdID string) (string, string, error) {
	if strings.ContainsAny(householdID, "/\\") || strings.Contains(householdID, "..") {
		return "", "", errors.New("invalid_household_id")
	}
	return filepath.Join(m.containerRoot, householdID), filepath.Join(m.agentRoot, householdID), nil
}

func (m *WorkspaceManager) Ensure(householdID string) (string, string, error) {
	containerPath, agentPath, err := m.paths(householdID)
	if err != nil {
		return "", "", err
	}
	dirs := []string{"docs", "raw-data/_incoming/family", "raw-data/people", "raw-data/family", "ai-vault/people", "ai-vault/family", ".nomi/jobs"}
	for _, dir := range dirs {
		if err := os.MkdirAll(filepath.Join(containerPath, dir), 0o700); err != nil {
			return "", "", err
		}
	}
	files := map[string]string{"AGENTS.md": workspaceAgents, ".gitignore": workspaceGitignore, "docs/REPO_COLLAB_GUIDE.md": workspaceGuide, "docs/ARCHITECTURE.md": workspaceArchitecture}
	for relative, content := range files {
		path := filepath.Join(containerPath, relative)
		if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
			if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
				return "", "", err
			}
		}
	}
	if err := m.ensureGit(containerPath); err != nil {
		return "", "", err
	}
	return containerPath, agentPath, nil
}

func (m *WorkspaceManager) MaterializeAsset(ctx context.Context, workspace string, asset Asset) (string, error) {
	subject := "family"
	if asset.PersonID != nil {
		subject = filepath.Join("people", *asset.PersonID)
	}
	relative := filepath.ToSlash(filepath.Join("raw-data", "_incoming", subject, asset.ID+"-"+safeFilename(asset.OriginalName)))
	target := filepath.Join(workspace, filepath.FromSlash(relative))
	if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
		return "", err
	}
	if _, err := os.Stat(target); err == nil {
		return relative, nil
	}
	source, err := m.storage.Open(ctx, asset.StorageKey)
	if err != nil {
		return "", err
	}
	defer source.Close()
	temp, err := os.CreateTemp(filepath.Dir(target), ".nomi-materialize-*")
	if err != nil {
		return "", err
	}
	tempPath := temp.Name()
	defer os.Remove(tempPath)
	if _, err = io.Copy(temp, source); err != nil {
		temp.Close()
		return "", err
	}
	if err = temp.Close(); err != nil {
		return "", err
	}
	if err = os.Chmod(tempPath, 0o600); err != nil {
		return "", err
	}
	if err = os.Rename(tempPath, target); err != nil {
		return "", err
	}
	if asset.MimeType == "application/pdf" || strings.EqualFold(filepath.Ext(asset.OriginalName), ".pdf") {
		m.preparePDF(ctx, target)
	}
	return relative, nil
}

func (m *WorkspaceManager) preparePDF(ctx context.Context, source string) {
	if binary, err := exec.LookPath("pdftotext"); err == nil {
		output := source + ".extracted.txt"
		command := exec.CommandContext(ctx, binary, "-layout", source, output)
		if command.Run() == nil {
			_ = os.Chmod(output, 0o600)
		}
	}
	if binary, err := exec.LookPath("pdftoppm"); err == nil {
		prefix := source + ".preview"
		command := exec.CommandContext(ctx, binary, "-png", "-f", "1", "-l", "3", "-scale-to", "1600", source, prefix)
		if command.Run() == nil {
			matches, _ := filepath.Glob(prefix + "-*.png")
			for _, match := range matches {
				_ = os.Chmod(match, 0o600)
			}
		}
	}
}

func (m *WorkspaceManager) ContextPath(personID *string) string {
	if personID == nil {
		return "ai-vault/family/index.md"
	}
	return filepath.ToSlash(filepath.Join("ai-vault", "people", *personID, "index.md"))
}

func (m *WorkspaceManager) ExistingContextPath(workspace string, personID *string) string {
	relative := m.ContextPath(personID)
	info, err := os.Stat(filepath.Join(workspace, filepath.FromSlash(relative)))
	if err != nil || !info.Mode().IsRegular() {
		return ""
	}
	return relative
}

func (m *WorkspaceManager) FinalizeIngest(workspace string, asset Asset, incoming, personName string, result AgentResult) (string, error) {
	subject := "family"
	if asset.PersonID != nil {
		subject = filepath.Join("people", *asset.PersonID)
	}
	createdAt := asset.CreatedAt
	if createdAt.IsZero() {
		createdAt = time.Now()
	}
	archived := filepath.ToSlash(filepath.Join("raw-data", subject, createdAt.Format("2006"), createdAt.Format("01"), asset.ID+"-"+safeFilename(asset.OriginalName)))
	source := filepath.Join(workspace, filepath.FromSlash(incoming))
	target := filepath.Join(workspace, filepath.FromSlash(archived))
	if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
		return "", err
	}
	if _, err := os.Stat(target); errors.Is(err, os.ErrNotExist) {
		if err = os.Rename(source, target); err != nil {
			return "", err
		}
	}
	sidecars, _ := filepath.Glob(source + ".*")
	for _, sidecar := range sidecars {
		suffix := strings.TrimPrefix(sidecar, source)
		sidecarTarget := target + suffix
		if _, err := os.Stat(sidecarTarget); errors.Is(err, os.ErrNotExist) {
			if err = os.Rename(sidecar, sidecarTarget); err != nil {
				return "", err
			}
		}
	}
	analysisRelative := filepath.ToSlash(filepath.Join("ai-vault", subject, "analyses", createdAt.Format("2006"), asset.ID+".md"))
	analysisPath := filepath.Join(workspace, filepath.FromSlash(analysisRelative))
	if err := os.MkdirAll(filepath.Dir(analysisPath), 0o700); err != nil {
		return "", err
	}
	questions, _ := json.Marshal(result.OpenQuestions)
	content := fmt.Sprintf("# %s\n\n- Subject: %s\n- Source: `%s`\n- Imported: %s\n- MIME type: %s\n- SHA-256: `%s`\n\n## Summary\n\n%s\n\n## What changed\n\n%s\n\n## Current assessment\n\n%s\n\n## Open questions\n\n```json\n%s\n```\n", result.Title, personName, archived, createdAt.Format(time.RFC3339), asset.MimeType, asset.SHA256, result.Summary, result.Changes, result.CurrentAssessment, questions)
	if err := os.WriteFile(analysisPath, []byte(content), 0o600); err != nil {
		return "", err
	}
	indexRelative := m.ContextPath(asset.PersonID)
	indexPath := filepath.Join(workspace, filepath.FromSlash(indexRelative))
	if err := os.MkdirAll(filepath.Dir(indexPath), 0o700); err != nil {
		return "", err
	}
	entry := fmt.Sprintf("- %s [%s](%s): %s\n", createdAt.Format("2006-01-02"), result.Title, relativeMarkdownLink(indexRelative, analysisRelative), result.Summary)
	current, err := os.ReadFile(indexPath)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return "", err
	}
	if !strings.Contains(string(current), asset.ID+".md") {
		if len(current) == 0 {
			current = []byte("# Long-term context\n\n")
		}
		current = append(current, []byte(entry)...)
		if err := os.WriteFile(indexPath, current, 0o600); err != nil {
			return "", err
		}
	}
	return archived, nil
}

func relativeMarkdownLink(from, to string) string {
	value, err := filepath.Rel(filepath.Dir(filepath.FromSlash(from)), filepath.FromSlash(to))
	if err != nil {
		return to
	}
	return filepath.ToSlash(value)
}

func (m *WorkspaceManager) Commit(ctx context.Context, workspace, message string) error {
	if err := runGit(ctx, workspace, "add", "--all"); err != nil {
		return err
	}
	check := exec.CommandContext(ctx, "git", "diff", "--cached", "--quiet")
	check.Dir = workspace
	if err := check.Run(); err == nil {
		return nil
	}
	return runGit(ctx, workspace, "commit", "-m", message)
}

func (m *WorkspaceManager) ensureGit(workspace string) error {
	if _, err := os.Stat(filepath.Join(workspace, ".git")); errors.Is(err, os.ErrNotExist) {
		if err := runGit(context.Background(), workspace, "init"); err != nil {
			return err
		}
		if err := runGit(context.Background(), workspace, "config", "user.name", "Nomi Agent"); err != nil {
			return err
		}
		if err := runGit(context.Background(), workspace, "config", "user.email", "agent@nomi.local"); err != nil {
			return err
		}
	}
	return nil
}
func runGit(ctx context.Context, dir string, args ...string) error {
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = dir
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git %s: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(string(output)))
	}
	return nil
}

const workspaceAgents = `# Nomi Household Workspace

This private workspace contains one household's sensitive health source material and AI-maintained context.

- Work only inside this workspace.
- Preserve originals and provenance. Never invent a source.
- Place raw material under raw-data and reusable context under ai-vault.
- Separate people by their opaque person ID; shared material belongs under family.
- Every analysis must explain what the new material says, what changed versus existing context, the current evidence-backed assessment, and open questions.
- Distinguish explicit source facts from inference and uncertainty.
- Do not diagnose, prescribe, change medication doses, or replace emergency care.
- Do not commit; the Nomi worker validates and commits the completed job.
`
const workspaceGitignore = `raw-data/_incoming/
.nomi/jobs/
`
const workspaceGuide = `# Collaboration guide

raw-data contains original or near-original source files. ai-vault contains reusable summaries, timelines, trends, insights and questions. Every AI document must cite relative raw-data paths. Never copy one original into several people directories; use references for cross-person material.
`
const workspaceArchitecture = `# Architecture

This directory is the filesystem source of truth for one household's source assets and long-term Agent context. Postgres outside this workspace owns authentication, authorization, asynchronous job state and mobile projections.
`
