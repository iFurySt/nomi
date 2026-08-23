package app

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/spf13/cobra"
)

type legacyPersonSpec struct {
	Slug         string
	DisplayName  string
	Relationship string
	PersonID     string
}

type legacyImportStats struct {
	AddedFiles      int
	ExistingFiles   int
	Knowledge       int
	CreatedPeople   int
	ExistingPeople  int
	SourceFileCount int
}

var legacySlugPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]*$`)
var legacyDatePattern = regexp.MustCompile(`(?:^|[^0-9])(20[0-9]{2}-[01][0-9]-[0-3][0-9])(?:[^0-9]|$)`)
var legacyTitleDatePattern = regexp.MustCompile(`^20[0-9]{2}-[01][0-9]-[0-3][0-9]\s*[-–—:]?\s*`)
var legacyCitationPattern = regexp.MustCompile("`((?:raw-data|ai-vault)/[^`]+)`")
var legacyUUIDPattern = regexp.MustCompile(`^[0-9a-f-]{36}$`)
var legacyOrderedListPattern = regexp.MustCompile(`^[0-9]+\. `)

func newImportLegacyWorkspaceCommand(cfg *Config) *cobra.Command {
	var sourceRoot, householdName string
	var personValues []string
	var dryRun bool
	cmd := &cobra.Command{
		Use:   "import-legacy-workspace",
		Short: "Import a staged Nomi filesystem knowledge base into one household",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			specs, err := parseLegacyPersonSpecs(personValues)
			if err != nil {
				return err
			}
			if strings.TrimSpace(sourceRoot) == "" || strings.TrimSpace(householdName) == "" {
				return errors.New("source-root and household-name are required")
			}
			return runLegacyImport(cmd.Context(), cmd, *cfg, filepath.Clean(sourceRoot), strings.TrimSpace(householdName), specs, dryRun)
		},
	}
	cmd.Flags().StringVar(&sourceRoot, "source-root", "", "Staged root containing raw-data and ai-vault")
	cmd.Flags().StringVar(&householdName, "household-name", "", "Exact target household name")
	cmd.Flags().StringArrayVar(&personValues, "person", nil, "Person mapping slug=display-name:relationship (repeatable)")
	cmd.Flags().BoolVar(&dryRun, "dry-run", false, "Validate and report without changing filesystem or Postgres")
	return cmd
}

func parseLegacyPersonSpecs(values []string) ([]legacyPersonSpec, error) {
	if len(values) == 0 {
		return nil, errors.New("at least one person mapping is required")
	}
	seen := map[string]bool{}
	specs := make([]legacyPersonSpec, 0, len(values))
	for _, value := range values {
		parts := strings.SplitN(value, "=", 2)
		if len(parts) != 2 {
			return nil, fmt.Errorf("invalid person mapping %q", value)
		}
		slug := strings.TrimSpace(parts[0])
		nameAndRelationship := strings.SplitN(parts[1], ":", 2)
		name := strings.TrimSpace(nameAndRelationship[0])
		relationship := ""
		if len(nameAndRelationship) == 2 {
			relationship = strings.TrimSpace(nameAndRelationship[1])
		}
		if !legacySlugPattern.MatchString(slug) || name == "" || seen[slug] {
			return nil, fmt.Errorf("invalid person mapping %q", value)
		}
		seen[slug] = true
		specs = append(specs, legacyPersonSpec{Slug: slug, DisplayName: name, Relationship: relationship})
	}
	return specs, nil
}

func runLegacyImport(ctx context.Context, cmd *cobra.Command, cfg Config, sourceRoot, householdName string, specs []legacyPersonSpec, dryRun bool) error {
	if err := validateLegacySource(sourceRoot, specs); err != nil {
		return err
	}
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	if err = pool.Ping(ctx); err != nil {
		return err
	}
	store := NewPostgresStore(pool)
	if !dryRun {
		if err = store.EnsureSchema(ctx); err != nil {
			return err
		}
	}
	principal, err := findImportHousehold(ctx, pool, householdName)
	if err != nil {
		return err
	}
	people, err := store.ListPeople(ctx, principal.HouseholdID)
	if err != nil {
		return err
	}
	stats := legacyImportStats{}
	for index := range specs {
		matches := []Person{}
		for _, person := range people {
			if strings.EqualFold(strings.TrimSpace(person.DisplayName), specs[index].DisplayName) {
				matches = append(matches, person)
			}
		}
		if len(matches) > 1 {
			return fmt.Errorf("multiple people named %q in target household", specs[index].DisplayName)
		}
		if len(matches) == 1 {
			specs[index].PersonID = matches[0].ID
			stats.ExistingPeople++
			continue
		}
		if dryRun {
			stats.CreatedPeople++
			continue
		}
		person, err := store.CreatePerson(ctx, principal, specs[index].DisplayName, specs[index].Relationship)
		if err != nil {
			return err
		}
		specs[index].PersonID = person.ID
		stats.CreatedPeople++
	}
	stats.SourceFileCount, err = countLegacySourceFiles(sourceRoot, specs)
	if err != nil {
		return err
	}
	if dryRun {
		fmt.Fprintf(cmd.OutOrStdout(), "validated household; source_files=%d existing_people=%d people_to_create=%d\n", stats.SourceFileCount, stats.ExistingPeople, stats.CreatedPeople)
		return nil
	}
	storage := NewFSStorage(filepath.Join(cfg.DataRoot, "assets"))
	workspaceManager := NewWorkspaceManager(filepath.Join(cfg.DataRoot, "workspaces"), cfg.AgentWorkspaceRoot, storage)
	workspace, _, err := workspaceManager.Ensure(principal.HouseholdID)
	if err != nil {
		return err
	}
	if err = copyLegacyWorkspace(sourceRoot, workspace, specs, &stats); err != nil {
		return err
	}
	entries, err := parseImportedKnowledge(workspace, principal.HouseholdID, specs)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if _, err = store.UpsertKnowledge(ctx, entry); err != nil {
			return fmt.Errorf("project %s: %w", entry.SourcePath, err)
		}
		stats.Knowledge++
	}
	if err = workspaceManager.Commit(ctx, workspace, "import: legacy family knowledge base"); err != nil {
		return err
	}
	fmt.Fprintf(cmd.OutOrStdout(), "imported household workspace; files_added=%d files_existing=%d knowledge=%d people_created=%d people_existing=%d\n", stats.AddedFiles, stats.ExistingFiles, stats.Knowledge, stats.CreatedPeople, stats.ExistingPeople)
	return nil
}

func findImportHousehold(ctx context.Context, pool *pgxpool.Pool, name string) (Principal, error) {
	rows, err := pool.Query(ctx, `select id::text,created_by::text from households where name=$1`, name)
	if err != nil {
		return Principal{}, err
	}
	defer rows.Close()
	matches := []Principal{}
	for rows.Next() {
		var principal Principal
		if err = rows.Scan(&principal.HouseholdID, &principal.UserID); err != nil {
			return Principal{}, err
		}
		principal.Role = RoleOwner
		matches = append(matches, principal)
	}
	if err = rows.Err(); err != nil {
		return Principal{}, err
	}
	if len(matches) != 1 {
		return Principal{}, fmt.Errorf("expected exactly one household named %q, found %d", name, len(matches))
	}
	return matches[0], nil
}

func validateLegacySource(root string, specs []legacyPersonSpec) error {
	for _, relative := range []string{"raw-data", "ai-vault"} {
		info, err := os.Stat(filepath.Join(root, relative))
		if err != nil || !info.IsDir() {
			return fmt.Errorf("legacy source missing %s", relative)
		}
	}
	for _, spec := range specs {
		for _, relative := range []string{filepath.Join("raw-data", "people", spec.Slug), filepath.Join("ai-vault", "people", spec.Slug)} {
			info, err := os.Stat(filepath.Join(root, relative))
			if err != nil || !info.IsDir() {
				return fmt.Errorf("legacy source missing %s", filepath.ToSlash(relative))
			}
		}
	}
	return nil
}

func legacyTrees(sourceRoot, workspace string, specs []legacyPersonSpec) [][3]string {
	trees := [][3]string{
		{filepath.Join(sourceRoot, "raw-data", "family"), filepath.Join(workspace, "raw-data", "family"), "raw"},
		{filepath.Join(sourceRoot, "ai-vault", "family"), filepath.Join(workspace, "ai-vault", "family"), "ai"},
	}
	for _, global := range []string{"_indexes", "_prompts", "_schemas"} {
		source := filepath.Join(sourceRoot, "ai-vault", global)
		if info, err := os.Stat(source); err == nil && info.IsDir() {
			trees = append(trees, [3]string{source, filepath.Join(workspace, "ai-vault", global), "ai"})
		}
	}
	for _, spec := range specs {
		trees = append(trees,
			[3]string{filepath.Join(sourceRoot, "raw-data", "people", spec.Slug), filepath.Join(workspace, "raw-data", "people", spec.PersonID), "raw"},
			[3]string{filepath.Join(sourceRoot, "ai-vault", "people", spec.Slug), filepath.Join(workspace, "ai-vault", "people", spec.PersonID), "ai"},
		)
	}
	return trees
}

func countLegacySourceFiles(sourceRoot string, specs []legacyPersonSpec) (int, error) {
	count := 0
	for _, tree := range legacyTrees(sourceRoot, sourceRoot, specs) {
		err := filepath.WalkDir(tree[0], func(path string, entry fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if entry.Type()&os.ModeSymlink != 0 {
				return fmt.Errorf("symlink not allowed: %s", path)
			}
			if entry.Type().IsRegular() && entry.Name() != ".gitkeep" {
				count++
			}
			return nil
		})
		if err != nil {
			return 0, err
		}
	}
	return count, nil
}

func copyLegacyWorkspace(sourceRoot, workspace string, specs []legacyPersonSpec, stats *legacyImportStats) error {
	replacements := map[string]string{}
	for _, spec := range specs {
		replacements["raw-data/people/"+spec.Slug] = "raw-data/people/" + spec.PersonID
		replacements["ai-vault/people/"+spec.Slug] = "ai-vault/people/" + spec.PersonID
	}
	for _, tree := range legacyTrees(sourceRoot, workspace, specs) {
		if err := copyLegacyTree(tree[0], tree[1], tree[2] == "ai", replacements, stats); err != nil {
			return err
		}
	}
	return nil
}

func copyLegacyTree(source, destination string, rewriteAI bool, replacements map[string]string, stats *legacyImportStats) error {
	return filepath.WalkDir(source, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("symlink not allowed: %s", path)
		}
		relative, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		target := filepath.Join(destination, relative)
		if entry.IsDir() {
			return os.MkdirAll(target, 0o700)
		}
		if !entry.Type().IsRegular() || entry.Name() == ".gitkeep" {
			return nil
		}
		contents, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if rewriteAI && strings.EqualFold(filepath.Ext(path), ".md") {
			value := string(contents)
			keys := make([]string, 0, len(replacements))
			for old := range replacements {
				keys = append(keys, old)
			}
			sort.Strings(keys)
			for _, old := range keys {
				value = strings.ReplaceAll(value, old, replacements[old])
			}
			contents = []byte(value)
		}
		return writeLegacyFile(target, contents, stats)
	})
}

func writeLegacyFile(target string, contents []byte, stats *legacyImportStats) error {
	if existing, err := os.ReadFile(target); err == nil {
		if sha256.Sum256(existing) != sha256.Sum256(contents) {
			return fmt.Errorf("refusing to overwrite different file: %s", target)
		}
		stats.ExistingFiles++
		return nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
		return err
	}
	temporary, err := os.CreateTemp(filepath.Dir(target), ".nomi-import-*")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	cleanup := func() {
		_ = temporary.Close()
		_ = os.Remove(temporaryPath)
	}
	if err = temporary.Chmod(0o600); err != nil {
		cleanup()
		return err
	}
	if _, err = temporary.Write(contents); err != nil {
		cleanup()
		return err
	}
	if err = temporary.Sync(); err != nil {
		cleanup()
		return err
	}
	if err = temporary.Close(); err != nil {
		_ = os.Remove(temporaryPath)
		return err
	}
	if err = os.Rename(temporaryPath, target); err != nil {
		_ = os.Remove(temporaryPath)
		return err
	}
	stats.AddedFiles++
	return nil
}

func parseImportedKnowledge(workspace, householdID string, specs []legacyPersonSpec) ([]KnowledgeEntry, error) {
	type root struct {
		path     string
		personID *string
	}
	roots := []root{{path: filepath.Join(workspace, "ai-vault", "family")}}
	for _, spec := range specs {
		personID := spec.PersonID
		roots = append(roots, root{path: filepath.Join(workspace, "ai-vault", "people", spec.PersonID), personID: &personID})
	}
	entries := []KnowledgeEntry{}
	for _, item := range roots {
		err := filepath.WalkDir(item.path, func(path string, entry fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if entry.IsDir() || !entry.Type().IsRegular() || !strings.EqualFold(filepath.Ext(path), ".md") || strings.EqualFold(entry.Name(), "README.md") {
				return nil
			}
			relative, err := filepath.Rel(workspace, path)
			if err != nil {
				return err
			}
			knowledge, err := parseLegacyKnowledgeFile(path, filepath.ToSlash(relative), householdID, item.personID)
			if err != nil {
				return err
			}
			entries = append(entries, knowledge)
			return nil
		})
		if err != nil {
			return nil, err
		}
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].SourcePath < entries[j].SourcePath })
	return entries, nil
}

func parseLegacyKnowledgeFile(path, sourcePath, householdID string, personID *string) (KnowledgeEntry, error) {
	contents, err := os.ReadFile(path)
	if err != nil {
		return KnowledgeEntry{}, err
	}
	title, summary, err := legacyMarkdownTitleAndSummary(contents)
	if err != nil {
		return KnowledgeEntry{}, err
	}
	if title == "" {
		title = strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	}
	title = strings.TrimSpace(legacyTitleDatePattern.ReplaceAllString(title, ""))
	if title == "" {
		title = strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	}
	if summary == "" || strings.Contains(summary, "raw-data/") || strings.Contains(summary, "ai-vault/") {
		summary = "已从原知识库导入，可在对话中继续查询完整内容。"
	}
	citations := []string{sourcePath}
	seen := map[string]bool{sourcePath: true}
	for _, match := range legacyCitationPattern.FindAllSubmatch(contents, -1) {
		citation := string(match[1])
		if !seen[citation] {
			seen[citation] = true
			citations = append(citations, citation)
		}
	}
	result, err := json.Marshal(AgentResult{Title: title, Summary: summary, Citations: citations}.Normalized())
	if err != nil {
		return KnowledgeEntry{}, err
	}
	hash := sha256.Sum256(contents)
	entry := KnowledgeEntry{
		HouseholdID: householdID,
		PersonID:    personID,
		Kind:        legacyKnowledgeKind(sourcePath),
		Title:       title,
		Summary:     summary,
		SourcePath:  sourcePath,
		SourceHash:  hex.EncodeToString(hash[:]),
		Result:      result,
	}
	if match := legacyDatePattern.FindStringSubmatch(filepath.Base(path)); len(match) == 2 {
		if occurredOn, parseErr := time.Parse("2006-01-02", match[1]); parseErr == nil {
			entry.OccurredOn = &occurredOn
		}
	}
	return entry, nil
}

func legacyKnowledgeKind(sourcePath string) string {
	parent := filepath.Base(filepath.Dir(filepath.FromSlash(sourcePath)))
	if parent == "family" || parent == "people" || legacyUUIDPattern.MatchString(parent) {
		return "note"
	}
	return strings.ReplaceAll(parent, "_", "-")
}

func legacyMarkdownTitleAndSummary(contents []byte) (string, string, error) {
	lines := []string{}
	scanner := bufio.NewScanner(strings.NewReader(string(contents)))
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for scanner.Scan() {
		lines = append(lines, strings.TrimSpace(scanner.Text()))
	}
	if err := scanner.Err(); err != nil {
		return "", "", err
	}
	title := ""
	for _, line := range lines {
		if strings.HasPrefix(line, "# ") {
			title = strings.TrimSpace(strings.TrimPrefix(line, "# "))
			break
		}
	}
	priorities := []string{"当前判断", "总体判断", "核心结论", "摘要", "当前进展", "如何理解", "核心结果", "背景"}
	for _, heading := range priorities {
		for index, line := range lines {
			if line == "## "+heading {
				if paragraph := legacyParagraphAfter(lines, index+1); paragraph != "" {
					return title, paragraph, nil
				}
			}
		}
	}
	return title, legacyParagraphAfter(lines, 0), nil
}

func legacyParagraphAfter(lines []string, start int) string {
	for index := start; index < len(lines); index++ {
		line := lines[index]
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "|") || strings.HasPrefix(line, "```") || strings.HasPrefix(line, ">") {
			continue
		}
		if strings.HasPrefix(line, "- ") || legacyOrderedListPattern.MatchString(line) {
			items := []string{}
			for ; index < len(lines) && len(items) < 3; index++ {
				candidate := lines[index]
				if strings.HasPrefix(candidate, "- ") {
					items = append(items, strings.TrimSpace(strings.TrimPrefix(candidate, "- ")))
					continue
				}
				if legacyOrderedListPattern.MatchString(candidate) {
					items = append(items, strings.TrimSpace(legacyOrderedListPattern.ReplaceAllString(candidate, "")))
					continue
				}
				break
			}
			return limitLegacySummary(strings.Join(items, "；"))
		}
		paragraph := []string{line}
		for next := index + 1; next < len(lines) && lines[next] != "" && !strings.HasPrefix(lines[next], "#"); next++ {
			paragraph = append(paragraph, lines[next])
		}
		return limitLegacySummary(strings.Join(paragraph, " "))
	}
	return ""
}

func limitLegacySummary(value string) string {
	value = strings.TrimSpace(value)
	runes := []rune(value)
	if len(runes) > 360 {
		return string(runes[:360]) + "…"
	}
	return value
}
