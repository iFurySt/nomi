package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

const seedXImageExtractionSchemaVersion = "2026-05-08.seedx-codex-image.v1"

var (
	ErrSeedXUnavailable     = errors.New("seedx_unavailable")
	ErrSeedXInvalidResponse = errors.New("seedx_invalid_response")
)

type ImageAnalyzer interface {
	AnalyzeImage(context.Context, StoredImage) (ImageExtraction, error)
}

type SeedXImageAnalyzerOptions struct {
	CWD             string
	Model           string
	ReasoningEffort string
	Timeout         time.Duration
}

type SeedXImageAnalyzer struct {
	controller *SeedXController
	options    SeedXImageAnalyzerOptions
}

func NewSeedXImageAnalyzer(controller *SeedXController, options SeedXImageAnalyzerOptions) *SeedXImageAnalyzer {
	if options.CWD == "" {
		options.CWD = "."
	}
	if options.ReasoningEffort == "" {
		options.ReasoningEffort = "medium"
	}
	if options.Timeout <= 0 {
		options.Timeout = 2 * time.Minute
	}
	return &SeedXImageAnalyzer{
		controller: controller,
		options:    options,
	}
}

func (a *SeedXImageAnalyzer) AnalyzeImage(ctx context.Context, image StoredImage) (ImageExtraction, error) {
	if a.controller == nil {
		return ImageExtraction{}, ErrSeedXUnavailable
	}
	runCtx, cancel := context.WithTimeout(ctx, a.options.Timeout)
	defer cancel()

	result, err := a.controller.RunCodex(runCtx, SeedXRunParams{
		Runtime:         "codex",
		CWD:             a.options.CWD,
		Input:           BuildImageAnalysisInput(image),
		Model:           a.options.Model,
		ReasoningEffort: a.options.ReasoningEffort,
	})
	if err != nil {
		return ImageExtraction{}, err
	}

	extraction, err := ParseImageExtractionJSON(result.Text)
	if err != nil {
		return ImageExtraction{}, err
	}
	return NormalizeImageExtraction(extraction, image), nil
}

func BuildImageAnalysisPrompt(image StoredImage) string {
	return fmt.Sprintf(`You are analyzing one user-uploaded image for Nomi, a personal body and life record app.

The image is provided to you as a localImage input item. Use that image content as the primary source.

Upload context:
- asset_name: %s
- source: %s
- mime_type: %s
- size_bytes: %d

Do not infer from filename alone. Do not modify files or write anything to disk.

Return exactly one JSON object and no markdown. The JSON object must match this schema:
{
  "schema_version": "%s",
  "direction": "input",
  "input_category": "food | beverage | caffeine | alcohol | nicotine | information | exercise | sunlight | social",
  "output_impacts": ["energy | mood | sleep | recovery | focus | health"],
  "title": "short human-readable title",
  "summary": "one concise sentence with uncertainty where relevant",
  "confidence": 0.0,
  "metadata": {
    "food_category": "optional",
    "portion_estimate": "optional",
    "weight_g": 0,
    "calories_kcal": 0,
    "protein_g": 0,
    "fat_g": 0,
    "carbs_g": 0,
    "fiber_g": 0,
    "water_ml": 0,
    "caffeine_mg": 0,
    "alcohol_g": 0,
    "nicotine_mg": 0,
    "duration_min": 0,
    "micronutrients": ["optional"],
    "minerals": ["optional"],
    "vitamins": ["optional"],
    "estimated_from": ["image_content"],
    "review_needed": ["optional"],
    "original_mime_type": "%s"
  }
}

Rules:
- Pick exactly one input_category. Use "information" for screenshots, documents, receipts, labels, lab reports, medication boxes, or other non-lifestyle context.
- For food, drinks, caffeine, alcohol, and nicotine, estimate nutrition or substance amounts only when visually supported; otherwise omit numeric fields and add review_needed entries.
- For exercise, sunlight, and social scenes, estimate duration only if visible context supports it; otherwise omit it and add review_needed.
- Never diagnose, treat, estimate disease risk, interpret abnormal results, recommend medication, or make urgent medical claims. If the image is medical, classify it as "information" and summarize it as a saved document that needs user review.
- Do not transcribe private identifiers, account numbers, exact addresses, or other sensitive text. Summarize their presence instead.
- Use confidence between 0.30 and 0.90. Lower confidence when the image is ambiguous, cropped, blurry, or not accessible.
- Include only valid JSON. Omit unknown optional fields instead of setting them to null.`, image.AssetName, image.Source, image.MimeType, image.SizeBytes, seedXImageExtractionSchemaVersion, image.MimeType)
}

func BuildImageAnalysisInput(image StoredImage) []SeedXInputItem {
	return []SeedXInputItem{
		{Type: "text", Text: BuildImageAnalysisPrompt(image)},
		{Type: "localImage", Path: image.Path, Name: image.AssetName},
	}
}

func ImageExtractionOutputSchema() json.RawMessage {
	return json.RawMessage(`{
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version", "direction", "input_category", "output_impacts", "title", "summary", "confidence", "metadata"],
  "properties": {
    "schema_version": { "type": "string" },
    "direction": { "type": "string", "enum": ["input"] },
    "input_category": {
      "type": "string",
      "enum": ["food", "beverage", "caffeine", "alcohol", "nicotine", "information", "exercise", "sunlight", "social"]
    },
    "output_impacts": {
      "type": "array",
      "items": { "type": "string", "enum": ["energy", "mood", "sleep", "recovery", "focus", "health"] }
    },
    "title": { "type": "string" },
    "summary": { "type": "string" },
    "confidence": { "type": "number", "minimum": 0.3, "maximum": 0.9 },
    "metadata": {
      "type": "object",
      "additionalProperties": false,
      "required": ["estimated_from"],
      "properties": {
        "food_category": { "type": "string" },
        "portion_estimate": { "type": "string" },
        "weight_g": { "type": "integer" },
        "calories_kcal": { "type": "integer" },
        "protein_g": { "type": "integer" },
        "fat_g": { "type": "integer" },
        "carbs_g": { "type": "integer" },
        "fiber_g": { "type": "integer" },
        "water_ml": { "type": "integer" },
        "caffeine_mg": { "type": "integer" },
        "alcohol_g": { "type": "integer" },
        "nicotine_mg": { "type": "integer" },
        "duration_min": { "type": "integer" },
        "micronutrients": { "type": "array", "items": { "type": "string" } },
        "minerals": { "type": "array", "items": { "type": "string" } },
        "vitamins": { "type": "array", "items": { "type": "string" } },
        "estimated_from": { "type": "array", "items": { "type": "string" } },
        "review_needed": { "type": "array", "items": { "type": "string" } },
        "original_mime_type": { "type": "string" }
      }
    }
  }
}`)
}

func ParseImageExtractionJSON(text string) (ImageExtraction, error) {
	jsonText := extractJSONObject(text)
	if jsonText == "" {
		return ImageExtraction{}, fmt.Errorf("%w: missing json object", ErrSeedXInvalidResponse)
	}
	var extraction ImageExtraction
	if err := json.Unmarshal([]byte(jsonText), &extraction); err != nil {
		return ImageExtraction{}, fmt.Errorf("%w: %v", ErrSeedXInvalidResponse, err)
	}
	if strings.TrimSpace(extraction.Title) == "" {
		return ImageExtraction{}, fmt.Errorf("%w: missing title", ErrSeedXInvalidResponse)
	}
	if strings.TrimSpace(extraction.Summary) == "" {
		extraction.Summary = extraction.Title
	}
	if strings.TrimSpace(extraction.InputCategory) == "" {
		extraction.InputCategory = "information"
	}
	if extraction.Metadata.EstimatedFrom == nil {
		extraction.Metadata.EstimatedFrom = []string{"image_content"}
	}
	return extraction, nil
}

func extractJSONObject(text string) string {
	text = strings.TrimSpace(text)
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	text = strings.TrimSpace(text)
	if strings.HasPrefix(text, "{") && strings.HasSuffix(text, "}") {
		return text
	}
	start := strings.Index(text, "{")
	end := strings.LastIndex(text, "}")
	if start < 0 || end <= start {
		return ""
	}
	return text[start : end+1]
}

func NormalizeImageExtraction(extraction ImageExtraction, image StoredImage) ImageExtraction {
	extraction.SchemaVersion = seedXImageExtractionSchemaVersion
	extraction.Direction = "input"
	extraction.InputCategory = normalizeInputCategory(extraction.InputCategory)
	extraction.OutputImpacts = normalizeOutputImpacts(extraction.OutputImpacts, extraction.InputCategory)
	extraction.Confidence = clampConfidence(extraction.Confidence)
	extraction.Metadata.OriginalMimeType = image.MimeType
	extraction.Metadata.EstimatedFrom = ensureString(extraction.Metadata.EstimatedFrom, "image_content")
	extraction.Metadata.ReviewNeeded = dedupeStrings(extraction.Metadata.ReviewNeeded)
	return extraction
}

func normalizeInputCategory(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "food", "beverage", "caffeine", "alcohol", "nicotine", "information", "exercise", "sunlight", "social":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return "information"
	}
}

func normalizeOutputImpacts(values []string, category string) []string {
	allowed := map[string]bool{
		"energy": true, "mood": true, "sleep": true, "recovery": true, "focus": true, "health": true,
	}
	out := make([]string, 0, len(values))
	seen := map[string]bool{}
	for _, value := range values {
		normalized := strings.ToLower(strings.TrimSpace(value))
		if allowed[normalized] && !seen[normalized] {
			out = append(out, normalized)
			seen[normalized] = true
		}
	}
	if len(out) > 0 {
		return out
	}
	switch category {
	case "exercise":
		return []string{"energy", "recovery", "health"}
	case "information":
		return []string{"focus", "mood"}
	case "social":
		return []string{"mood", "recovery", "health"}
	default:
		return []string{"energy", "health"}
	}
}

func clampConfidence(value float64) float64 {
	if value < 0.3 {
		return 0.3
	}
	if value > 0.9 {
		return 0.9
	}
	return value
}

func ensureString(values []string, fallback string) []string {
	values = dedupeStrings(values)
	if len(values) == 0 {
		return []string{fallback}
	}
	return values
}

func dedupeStrings(values []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		normalized := strings.TrimSpace(value)
		if normalized == "" || seen[normalized] {
			continue
		}
		seen[normalized] = true
		out = append(out, normalized)
	}
	return out
}

func extractionSummary(extraction ImageExtraction) string {
	values := []string{}
	appendInt := func(value int, suffix string) {
		if value > 0 {
			values = append(values, strconv.Itoa(value)+suffix)
		}
	}
	appendInt(extraction.Metadata.CaloriesKcal, " kcal")
	appendInt(extraction.Metadata.ProteinG, "g protein")
	appendInt(extraction.Metadata.CarbsG, "g carbs")
	appendInt(extraction.Metadata.FatG, "g fat")
	appendInt(extraction.Metadata.FiberG, "g fiber")
	appendInt(extraction.Metadata.WaterMl, "ml water")
	appendInt(extraction.Metadata.CaffeineMg, "mg caffeine")
	appendInt(extraction.Metadata.NicotineMg, "mg nicotine")
	appendInt(extraction.Metadata.DurationMin, " min")
	if len(values) > 0 {
		return strings.Join(values, " / ")
	}
	return extraction.Summary
}

func recordTypeForInputCategory(category string) string {
	switch category {
	case "information":
		return "document"
	case "food", "beverage", "caffeine", "alcohol", "nicotine":
		return "food"
	default:
		return "note"
	}
}

func extractionRecordMetadata(extraction ImageExtraction, image StoredImage) map[string]string {
	values := map[string]string{
		"schema_version":     extraction.SchemaVersion,
		"direction":          extraction.Direction,
		"input_category":     extraction.InputCategory,
		"output_impacts":     strings.Join(extraction.OutputImpacts, ","),
		"asset_name":         image.AssetName,
		"source":             image.Source,
		"mime_type":          image.MimeType,
		"image_uri":          image.URI,
		"detail":             extractionSummary(extraction),
		"estimated_from":     strings.Join(extraction.Metadata.EstimatedFrom, ","),
		"review_needed":      strings.Join(extraction.Metadata.ReviewNeeded, ","),
		"analysis_provider":  "seedx.codex",
		"analysis_transport": "seedx.daemon.command.run",
	}
	addString := func(key string, value string) {
		if value != "" {
			values[key] = value
		}
	}
	addInt := func(key string, value int) {
		if value > 0 {
			values[key] = strconv.Itoa(value)
		}
	}
	addString("food_category", extraction.Metadata.FoodCategory)
	addString("portion_estimate", extraction.Metadata.PortionEstimate)
	addInt("weight_g", extraction.Metadata.WeightG)
	addInt("calories_kcal", extraction.Metadata.CaloriesKcal)
	addInt("protein_g", extraction.Metadata.ProteinG)
	addInt("fat_g", extraction.Metadata.FatG)
	addInt("carbs_g", extraction.Metadata.CarbsG)
	addInt("fiber_g", extraction.Metadata.FiberG)
	addInt("water_ml", extraction.Metadata.WaterMl)
	addInt("caffeine_mg", extraction.Metadata.CaffeineMg)
	addInt("alcohol_g", extraction.Metadata.AlcoholG)
	addInt("nicotine_mg", extraction.Metadata.NicotineMg)
	addInt("duration_min", extraction.Metadata.DurationMin)
	addString("micronutrients", strings.Join(extraction.Metadata.Micronutrients, ","))
	addString("minerals", strings.Join(extraction.Metadata.Minerals, ","))
	addString("vitamins", strings.Join(extraction.Metadata.Vitamins, ","))
	return values
}
