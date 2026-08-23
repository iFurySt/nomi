package app

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseLegacyPersonSpecs(t *testing.T) {
	specs, err := parseLegacyPersonSpecs([]string{"leo=Leo:本人", "lin=Lin:配偶"})
	if err != nil {
		t.Fatal(err)
	}
	if len(specs) != 2 || specs[1].Slug != "lin" || specs[1].DisplayName != "Lin" || specs[1].Relationship != "配偶" {
		t.Fatalf("unexpected specs: %#v", specs)
	}
	for _, invalid := range [][]string{{}, {"../leo=Leo"}, {"leo"}, {"leo=Leo", "leo=Other"}} {
		if _, err := parseLegacyPersonSpecs(invalid); err == nil {
			t.Fatalf("accepted invalid mapping: %#v", invalid)
		}
	}
}

func TestCopyLegacyWorkspaceMapsPeopleAndNeverOverwrites(t *testing.T) {
	source := t.TempDir()
	workspace := t.TempDir()
	writeTestFile(t, filepath.Join(source, "raw-data", "family", "shared.txt"), "family")
	writeTestFile(t, filepath.Join(source, "raw-data", "people", "leo", "report.txt"), "original")
	writeTestFile(t, filepath.Join(source, "raw-data", "people", "lin", "report.txt"), "original-lin")
	writeTestFile(t, filepath.Join(source, "ai-vault", "family", "summary.md"), "# Family\n\n## 当前判断\n\nShared context.\n")
	writeTestFile(t, filepath.Join(source, "ai-vault", "people", "leo", "summary.md"), "# Leo\n\n`raw-data/people/leo/report.txt`\n")
	writeTestFile(t, filepath.Join(source, "ai-vault", "people", "lin", "summary.md"), "# Lin\n\n`ai-vault/people/lin/summary.md`\n")

	specs := []legacyPersonSpec{{Slug: "leo", PersonID: "11111111-1111-1111-1111-111111111111"}, {Slug: "lin", PersonID: "22222222-2222-2222-2222-222222222222"}}
	stats := legacyImportStats{}
	if err := copyLegacyWorkspace(source, workspace, specs, &stats); err != nil {
		t.Fatal(err)
	}
	if stats.AddedFiles != 6 {
		t.Fatalf("added files=%d", stats.AddedFiles)
	}
	leoAI := filepath.Join(workspace, "ai-vault", "people", specs[0].PersonID, "summary.md")
	contents, err := os.ReadFile(leoAI)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(contents), "raw-data/people/"+specs[0].PersonID+"/report.txt") {
		t.Fatalf("person citation not rewritten: %s", contents)
	}
	sourceContents, err := os.ReadFile(filepath.Join(source, "ai-vault", "people", "leo", "summary.md"))
	if err != nil || !strings.Contains(string(sourceContents), "raw-data/people/leo/report.txt") {
		t.Fatalf("source was changed: %q err=%v", sourceContents, err)
	}

	repeat := legacyImportStats{}
	if err = copyLegacyWorkspace(source, workspace, specs, &repeat); err != nil {
		t.Fatal(err)
	}
	if repeat.AddedFiles != 0 || repeat.ExistingFiles != 6 {
		t.Fatalf("repeat stats=%+v", repeat)
	}
	if err = os.WriteFile(leoAI, []byte("different"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err = copyLegacyWorkspace(source, workspace, specs, &legacyImportStats{}); err == nil || !strings.Contains(err.Error(), "refusing to overwrite") {
		t.Fatalf("expected overwrite refusal, got %v", err)
	}
}

func TestParseLegacyKnowledgeFile(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "2026-08-17-example.md")
	writeTestFile(t, path, "# 检查汇总\n\n## 来源\n\n- `raw-data/people/person-id/report.pdf`\n\n## 当前判断\n\n第一段是 App 摘要。\n\n第二段不应进入摘要。\n")
	personID := "person-id"
	entry, err := parseLegacyKnowledgeFile(path, "ai-vault/people/person-id/report-summaries/2026-08-17-example.md", "household-id", &personID)
	if err != nil {
		t.Fatal(err)
	}
	if entry.Title != "检查汇总" || entry.Summary != "第一段是 App 摘要。" || entry.Kind != "report-summaries" {
		t.Fatalf("unexpected entry: %+v", entry)
	}
	if entry.OccurredOn == nil || entry.OccurredOn.Format("2006-01-02") != "2026-08-17" {
		t.Fatalf("unexpected date: %v", entry.OccurredOn)
	}
	if !strings.Contains(string(entry.Result), "raw-data/people/person-id/report.pdf") {
		t.Fatalf("missing citation: %s", entry.Result)
	}
}

func TestLegacyKnowledgeCorpus(t *testing.T) {
	source := os.Getenv("NOMI_LEGACY_TEST_ROOT")
	if source == "" {
		t.Skip("set NOMI_LEGACY_TEST_ROOT to validate a real legacy knowledge base")
	}
	workspace := t.TempDir()
	specs := []legacyPersonSpec{{Slug: "leo", PersonID: "11111111-1111-1111-1111-111111111111"}, {Slug: "lin", PersonID: "22222222-2222-2222-2222-222222222222"}}
	stats := legacyImportStats{}
	if err := validateLegacySource(source, specs); err != nil {
		t.Fatal(err)
	}
	if err := copyLegacyWorkspace(source, workspace, specs, &stats); err != nil {
		t.Fatal(err)
	}
	entries, err := parseImportedKnowledge(workspace, "33333333-3333-3333-3333-333333333333", specs)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) < 20 {
		t.Fatalf("expected a useful knowledge corpus, got %d entries", len(entries))
	}
	for _, entry := range entries {
		if strings.TrimSpace(entry.Title) == "" || strings.TrimSpace(entry.Summary) == "" {
			t.Fatalf("incomplete entry: %+v", entry)
		}
		if strings.Contains(string(entry.Result), "/people/leo/") || strings.Contains(string(entry.Result), "/people/lin/") {
			t.Fatalf("unmapped citation in %s", entry.SourcePath)
		}
	}
}

func writeTestFile(t *testing.T, path, contents string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		t.Fatal(err)
	}
}
