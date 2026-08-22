package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

type AgentRequest struct {
	Kind   string
	CWD    string
	Prompt string
}
type AgentRunner interface {
	Run(context.Context, AgentRequest) (AgentResult, error)
}

type SeedXAgentRunner struct {
	controller      *SeedXController
	model           string
	reasoningEffort string
	timeout         time.Duration
}

func NewSeedXAgentRunner(controller *SeedXController, model, effort string, timeout time.Duration) *SeedXAgentRunner {
	return &SeedXAgentRunner{controller: controller, model: model, reasoningEffort: effort, timeout: timeout}
}
func (r *SeedXAgentRunner) Run(ctx context.Context, request AgentRequest) (AgentResult, error) {
	if r.timeout <= 0 {
		r.timeout = 5 * time.Minute
	}
	ctx, cancel := context.WithTimeout(ctx, r.timeout)
	defer cancel()
	run, err := r.controller.RunCodex(ctx, SeedXRunParams{Runtime: "codex", CWD: request.CWD, Input: []SeedXInputItem{{Type: "text", Text: request.Prompt}}, Model: r.model, ReasoningEffort: r.reasoningEffort, OutputSchema: agentOutputSchema()})
	if err != nil {
		return AgentResult{}, err
	}
	result, err := parseAgentResult(run.Text)
	if err != nil {
		return AgentResult{}, err
	}
	return result, result.Validate(request.Kind)
}

func agentOutputSchema() json.RawMessage {
	return json.RawMessage(`{"type":"object","additionalProperties":false,"required":["title","answer","summary","changes","current_assessment","open_questions","citations"],"properties":{"title":{"type":"string"},"answer":{"type":"string"},"summary":{"type":"string"},"changes":{"type":"string"},"current_assessment":{"type":"string"},"open_questions":{"type":"array","items":{"type":"string"}},"citations":{"type":"array","items":{"type":"string"}}}}`)
}
func parseAgentResult(text string) (AgentResult, error) {
	value := strings.TrimSpace(text)
	value = strings.TrimPrefix(value, "```json")
	value = strings.TrimPrefix(value, "```")
	value = strings.TrimSuffix(value, "```")
	value = strings.TrimSpace(value)
	if !strings.HasPrefix(value, "{") {
		start := strings.Index(value, "{")
		if start < 0 {
			return AgentResult{}, errors.New("agent_result_json_missing")
		}
		value = value[start:]
	}
	decoder := json.NewDecoder(strings.NewReader(value))
	var out AgentResult
	found := false
	for {
		var candidate AgentResult
		if err := decoder.Decode(&candidate); err != nil {
			if found {
				break
			}
			return AgentResult{}, fmt.Errorf("agent_result_invalid: %w", err)
		}
		if strings.TrimSpace(candidate.Title) != "" || strings.TrimSpace(candidate.Answer) != "" || strings.TrimSpace(candidate.Summary) != "" {
			out = candidate
			found = true
		}
	}
	if !found {
		return AgentResult{}, errors.New("agent_result_json_missing")
	}
	return out, nil
}

func ingestPrompt(personName, relativePath, contextPath, jobID string) string {
	return fmt.Sprintf(`Analyze the single new household health source at %q for subject %q. Read AGENTS.md and, only if it exists, the compact prior context at %q. For a PDF, inspect any sibling files matching %q; the worker may have extracted text and rendered the first pages there. Do not rename, move, edit, or create files; the Nomi worker owns archival. Return only the required JSON in Chinese: a concise title, factual summary, what this changes versus prior context, current evidence-backed assessment, open questions, and citations. Cite %q for new-source facts. Keep uncertainty explicit and do not diagnose or prescribe. answer may be empty. Job id: %s.`, relativePath, personName, contextPath, relativePath+".*", relativePath, jobID)
}
func chatPrompt(personName string, messages []Message) string {
	var b strings.Builder
	b.WriteString("Answer the latest user question in Chinese by reading this household workspace and following AGENTS.md. Scope: ")
	b.WriteString(personName)
	b.WriteString(". Use prior messages for conversational context. Cite relative workspace paths that support personal facts. Clearly state when evidence is missing. Return only the required JSON; put the complete response in answer and citations, while other string fields may be empty. Conversation:\n")
	for _, m := range messages {
		fmt.Fprintf(&b, "%s: %s\n", m.Role, m.Content)
	}
	return b.String()
}
