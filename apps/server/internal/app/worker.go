package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"go.uber.org/zap"
)

type JobWorker struct {
	store        Store
	workspace    *WorkspaceManager
	runner       AgentRunner
	logger       *zap.Logger
	pollInterval time.Duration
}

func NewJobWorker(store Store, workspace *WorkspaceManager, runner AgentRunner, logger *zap.Logger, poll time.Duration) *JobWorker {
	if logger == nil {
		logger = zap.NewNop()
	}
	if poll <= 0 {
		poll = 750 * time.Millisecond
	}
	return &JobWorker{store: store, workspace: workspace, runner: runner, logger: logger, pollInterval: poll}
}

func (w *JobWorker) Run(ctx context.Context) {
	if w == nil || w.store == nil || w.workspace == nil || w.runner == nil {
		return
	}
	_ = w.store.RequeueExpiredJobs(ctx, time.Now().Add(-10*time.Minute))
	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()
	for {
		if err := w.ProcessNext(ctx); err != nil && !errors.Is(err, ErrNotFound) && !errors.Is(err, context.Canceled) {
			w.logger.Warn("job processing failed", zap.Error(err))
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (w *JobWorker) ProcessNext(ctx context.Context) error {
	job, err := w.store.ClaimNextJob(ctx, time.Now())
	if err != nil {
		return err
	}
	start := time.Now()
	w.logger.Info("agent job started", zap.String("job_id", job.ID), zap.String("kind", job.Kind), zap.String("household_id", job.HouseholdID))
	result, err := w.process(ctx, job)
	if err != nil {
		_ = w.store.FailJob(context.Background(), job.ID, truncateError(err.Error()))
		w.logger.Warn("agent job failed", zap.String("job_id", job.ID), zap.Duration("duration", time.Since(start)), zap.Error(err))
		return err
	}
	data, err := json.Marshal(result)
	if err != nil {
		return err
	}
	if err = w.store.CompleteJob(ctx, job.ID, data); err != nil {
		return err
	}
	w.logger.Info("agent job completed", zap.String("job_id", job.ID), zap.Duration("duration", time.Since(start)))
	return nil
}

func (w *JobWorker) process(ctx context.Context, job Job) (AgentResult, error) {
	workspace, agentCWD, err := w.workspace.Ensure(job.HouseholdID)
	if err != nil {
		return AgentResult{}, err
	}
	switch job.Kind {
	case JobKindIngest:
		return w.processIngest(ctx, job, workspace, agentCWD)
	case JobKindChat:
		return w.processChat(ctx, job, workspace, agentCWD)
	default:
		return AgentResult{}, fmt.Errorf("unsupported_job_kind: %s", job.Kind)
	}
}

func (w *JobWorker) processIngest(ctx context.Context, job Job, workspace, agentCWD string) (AgentResult, error) {
	var payload struct {
		AssetID string `json:"asset_id"`
	}
	if err := json.Unmarshal(job.Payload, &payload); err != nil || payload.AssetID == "" {
		return AgentResult{}, errors.New("ingest_payload_invalid")
	}
	asset, err := w.store.GetAsset(ctx, job.HouseholdID, payload.AssetID)
	if err != nil {
		return AgentResult{}, err
	}
	relative, err := w.workspace.MaterializeAsset(ctx, workspace, asset)
	if err != nil {
		return AgentResult{}, err
	}
	personName := "家庭共享"
	if asset.PersonID != nil {
		personName = w.personName(ctx, job.HouseholdID, *asset.PersonID)
	}
	contextPath := w.workspace.ContextPath(asset.PersonID)
	result, err := w.runner.Run(ctx, AgentRequest{Kind: JobKindIngest, CWD: agentCWD, Prompt: ingestPrompt(personName, relative, contextPath, job.ID)})
	if err != nil {
		return AgentResult{}, err
	}
	archived, err := w.workspace.FinalizeIngest(workspace, asset, relative, personName, result)
	if err != nil {
		return AgentResult{}, err
	}
	for index, citation := range result.Citations {
		if citation == relative {
			result.Citations[index] = archived
		}
	}
	if len(result.Citations) == 0 {
		result.Citations = []string{archived}
	}
	data, err := json.Marshal(result)
	if err != nil {
		return AgentResult{}, err
	}
	if err = w.store.CompleteAssetAnalysis(ctx, job.HouseholdID, asset.ID, data); err != nil {
		return AgentResult{}, err
	}
	if err = w.workspace.Commit(ctx, workspace, "ingest: "+safeCommitTitle(result.Title, asset.OriginalName)); err != nil {
		return AgentResult{}, err
	}
	return result, nil
}

func (w *JobWorker) processChat(ctx context.Context, job Job, workspace, agentCWD string) (AgentResult, error) {
	var payload struct {
		ThreadID string `json:"thread_id"`
	}
	if err := json.Unmarshal(job.Payload, &payload); err != nil || payload.ThreadID == "" {
		return AgentResult{}, errors.New("chat_payload_invalid")
	}
	thread, err := w.store.GetThread(ctx, job.HouseholdID, payload.ThreadID)
	if err != nil {
		return AgentResult{}, err
	}
	messages, err := w.store.ListMessages(ctx, job.HouseholdID, thread.ID)
	if err != nil {
		return AgentResult{}, err
	}
	scope := "整个家庭"
	if thread.PersonID != nil {
		scope = w.personName(ctx, job.HouseholdID, *thread.PersonID)
	}
	result, err := w.runner.Run(ctx, AgentRequest{Kind: JobKindChat, CWD: agentCWD, Prompt: chatPrompt(scope, messages)})
	if err != nil {
		return AgentResult{}, err
	}
	citations, _ := json.Marshal(result.Citations)
	_, err = w.store.CreateMessage(ctx, Message{HouseholdID: job.HouseholdID, ThreadID: thread.ID, Role: "assistant", Content: result.Answer, Citations: citations, Status: "completed"})
	return result, err
}

func (w *JobWorker) personName(ctx context.Context, householdID, personID string) string {
	people, err := w.store.ListPeople(ctx, householdID)
	if err == nil {
		for _, person := range people {
			if person.ID == personID {
				return person.DisplayName
			}
		}
	}
	return personID
}
func safeCommitTitle(title, fallback string) string {
	value := strings.TrimSpace(title)
	if value == "" {
		value = fallback
	}
	value = strings.ReplaceAll(value, "\n", " ")
	if len(value) > 72 {
		value = value[:72]
	}
	return value
}
func truncateError(value string) string {
	if len(value) > 1000 {
		return value[:1000]
	}
	return value
}
