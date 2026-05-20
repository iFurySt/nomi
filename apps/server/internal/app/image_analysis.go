package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const seedXImageExtractionSchemaVersion = "2026-05-15.seedx-codex-zh.v3"

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
	PublicBaseURL   string
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

	input, err := buildImageAnalysisInput(image, a.options.PublicBaseURL)
	if err != nil {
		return ImageExtraction{}, err
	}
	result, err := a.controller.RunCodex(runCtx, SeedXRunParams{
		Runtime:         "codex",
		CWD:             a.options.CWD,
		Input:           input,
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
	return fmt.Sprintf(`你正在为 Nomi（知己，一个个人身体与生活记录应用）分析用户上传的一张图片或一份文档预览。

内容会以图片 input item 提供；生产环境中 SeedX daemon 会从 Nomi server 的短期资产 URL 下载到本机再交给 Codex。PDF 会先转成上传文档首页的 JPEG 预览。请只根据可见图片或文档内容判断，不要只根据文件名推断，也不要修改或写入任何文件。

上传上下文：
- asset_name: %s
- source: %s
- mime_type: %s
- size_bytes: %d

返回内容必须是严格 JSON 对象，不要输出 markdown。JSON key 和枚举值必须保持下方英文 contract；但所有用户可见的自由文本字段必须使用简体中文，包括 title、summary、food_category、portion_estimate、issuer、micronutrients、minerals、vitamins、review_needed 等。暂时不支持英文输出。

JSON 对象必须匹配这个结构：
{
  "schema_version": "%s",
  "direction": "input",
  "input_category": "food | beverage | caffeine | alcohol | nicotine | information | exercise | sunlight | social",
  "output_impacts": ["energy | mood | sleep | recovery | focus | health"],
  "title": "简短中文标题",
  "summary": "一句中文摘要，必要时说明不确定性",
  "confidence": 0.0,
  "metadata": {
    "food_category": "可选，中文",
    "portion_estimate": "可选，中文",
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
    "micronutrients": ["可选，中文"],
    "minerals": ["可选，中文"],
    "vitamins": ["可选，中文"],
    "document_kind": "optional: medical_report | lab_result | checkup_report | invoice | receipt | prescription_or_medication | other_document",
    "document_date": "可选，仅填写可见日期",
    "issuer": "可选，中文机构或商户类别，不要包含隐私标识",
    "currency": "optional visible currency",
    "total_amount": "optional visible total amount",
    "estimated_from": ["image_content"],
    "review_needed": ["可选，中文"],
    "original_mime_type": "%s"
  }
}

规则：
- 只选择一个 input_category。截图、PDF、文档、收据、发票、标签、检验报告、体检报告、检查报告、药品盒等非生活行为内容使用 "information"。
- 医疗、体检、检验、检查类报告在可见内容支持时，将 document_kind 设为 "medical_report"、"lab_result" 或 "checkup_report"。只用中文总结“这是什么文件、已保存供用户复核”，不要判断指标是否正常或异常。
- 发票、收据、付款凭证在可见内容支持时，将 document_kind 设为 "invoice" 或 "receipt"。只在可见时用中文概括商户/类别、金额和日期，不要转写隐私编号。
- 食物、饮料、咖啡因、酒精、尼古丁只在视觉信息支持时估算营养或摄入量；不确定时省略数值字段，并在 review_needed 中用中文说明需要用户复核。
- 运动、日照、社交场景只在可见内容支持时估算时长；不确定时省略时长，并在 review_needed 中用中文说明。
- 绝不诊断、治疗、评估疾病风险、解读异常、推荐药物或给出紧急医疗判断。医疗文件只能归类为 "information"，并用中文描述为已保存待用户复核的资料。
- 不要转写身份证号、账号、精确地址、票据号码等隐私标识；只用中文概括存在这类信息。
- confidence 必须在 0.30 到 0.90 之间。图片含糊、裁切、模糊或不可读时降低置信度。
- 只输出合法 JSON。未知可选字段直接省略，不要设为 null。`, image.AssetName, image.Source, image.MimeType, image.SizeBytes, seedXImageExtractionSchemaVersion, image.MimeType)
}

func BuildImageAnalysisInput(image StoredImage) []SeedXInputItem {
	input, _ := buildImageAnalysisInput(image, "")
	return input
}

func buildImageAnalysisInput(image StoredImage, publicBaseURL string) ([]SeedXInputItem, error) {
	item, err := buildImageInputItem(image, publicBaseURL)
	if err != nil {
		return nil, err
	}
	return []SeedXInputItem{
		{Type: "text", Text: BuildImageAnalysisPrompt(image)},
		item,
	}, nil
}

func buildImageInputItem(image StoredImage, publicBaseURL string) (SeedXInputItem, error) {
	if strings.TrimSpace(publicBaseURL) == "" {
		return SeedXInputItem{Type: "localImage", Path: image.Path, Name: filepath.Base(image.Path)}, nil
	}
	assetURL, err := publicImageAssetURL(publicBaseURL, image.URI)
	if err != nil {
		return SeedXInputItem{}, err
	}
	sizeBytes, sha256Hex := imageAnalysisFileMetadata(image.Path)
	return SeedXInputItem{
		Type:      "image",
		URL:       assetURL,
		Name:      filepath.Base(image.Path),
		MimeType:  imageAnalysisMimeType(image),
		SizeBytes: sizeBytes,
		SHA256:    sha256Hex,
	}, nil
}

func publicImageAssetURL(publicBaseURL string, imageURI string) (string, error) {
	baseURL := strings.TrimSpace(publicBaseURL)
	parsedBase, err := url.Parse(baseURL)
	if err != nil || parsedBase.Scheme == "" || parsedBase.Host == "" {
		return "", fmt.Errorf("invalid public base url")
	}
	const prefix = "local://images/"
	if !strings.HasPrefix(imageURI, prefix) {
		return "", fmt.Errorf("unsupported image uri")
	}
	relativePath := strings.TrimPrefix(imageURI, prefix)
	assetURL, err := url.JoinPath(baseURL, "images", relativePath)
	if err != nil {
		return "", err
	}
	return assetURL, nil
}

func imageAnalysisFileMetadata(path string) (int64, string) {
	data, err := os.ReadFile(path)
	if err != nil {
		return 0, ""
	}
	sum := sha256.Sum256(data)
	return int64(len(data)), hex.EncodeToString(sum[:])
}

func imageAnalysisMimeType(image StoredImage) string {
	ext := strings.ToLower(filepath.Ext(image.Path))
	if ext == ".jpg" || ext == ".jpeg" {
		return "image/jpeg"
	}
	return image.MimeType
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
        "document_kind": {
          "type": "string",
          "enum": ["medical_report", "lab_result", "checkup_report", "invoice", "receipt", "prescription_or_medication", "other_document"]
        },
        "document_date": { "type": "string" },
        "issuer": { "type": "string" },
        "currency": { "type": "string" },
        "total_amount": { "type": "string" },
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
	extraction.Metadata.DocumentKind = normalizeDocumentKind(extraction.Metadata.DocumentKind)
	extraction.Metadata.EstimatedFrom = ensureString(extraction.Metadata.EstimatedFrom, "image_content")
	extraction.Metadata.ReviewNeeded = dedupeStrings(extraction.Metadata.ReviewNeeded)
	return extraction
}

func normalizeDocumentKind(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "medical_report", "lab_result", "checkup_report", "invoice", "receipt", "prescription_or_medication", "other_document":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return ""
	}
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
	appendInt(extraction.Metadata.CaloriesKcal, " 千卡")
	appendInt(extraction.Metadata.ProteinG, "g 蛋白质")
	appendInt(extraction.Metadata.CarbsG, "g 碳水")
	appendInt(extraction.Metadata.FatG, "g 脂肪")
	appendInt(extraction.Metadata.FiberG, "g 膳食纤维")
	appendInt(extraction.Metadata.WaterMl, "ml 水")
	appendInt(extraction.Metadata.CaffeineMg, "mg 咖啡因")
	appendInt(extraction.Metadata.NicotineMg, "mg 尼古丁")
	appendInt(extraction.Metadata.DurationMin, " 分钟")
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
	addString("document_kind", extraction.Metadata.DocumentKind)
	addString("document_date", extraction.Metadata.DocumentDate)
	addString("issuer", extraction.Metadata.Issuer)
	addString("currency", extraction.Metadata.Currency)
	addString("total_amount", extraction.Metadata.TotalAmount)
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

func pendingImageRecordMetadata(image StoredImage) map[string]string {
	return map[string]string{
		"direction":          "input",
		"input_category":     "information",
		"asset_name":         image.AssetName,
		"source":             image.Source,
		"mime_type":          image.MimeType,
		"image_uri":          image.URI,
		"detail":             "等待 SeedX 识别文件内容",
		"analysis_provider":  "seedx.codex",
		"analysis_transport": "seedx.daemon.command.run",
	}
}
