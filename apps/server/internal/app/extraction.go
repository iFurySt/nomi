package app

import (
	"encoding/base64"
	"path/filepath"
	"strings"
)

type ImageExtractionRequest struct {
	AssetName   string `json:"asset_name"`
	Source      string `json:"source"`
	MimeType    string `json:"mime_type,omitempty"`
	ImageBase64 string `json:"image_base64,omitempty"`
}

type ImageExtraction struct {
	RecordID      string             `json:"record_id,omitempty"`
	ImageURI      string             `json:"image_uri,omitempty"`
	SchemaVersion string             `json:"schema_version"`
	Direction     string             `json:"direction"`
	InputCategory string             `json:"input_category"`
	OutputImpacts []string           `json:"output_impacts"`
	Title         string             `json:"title"`
	Summary       string             `json:"summary"`
	Confidence    float64            `json:"confidence"`
	Metadata      ExtractionMetadata `json:"metadata"`
}

type ExtractionMetadata struct {
	FoodCategory     string   `json:"food_category,omitempty"`
	PortionEstimate  string   `json:"portion_estimate,omitempty"`
	WeightG          int      `json:"weight_g,omitempty"`
	CaloriesKcal     int      `json:"calories_kcal,omitempty"`
	ProteinG         int      `json:"protein_g,omitempty"`
	FatG             int      `json:"fat_g,omitempty"`
	CarbsG           int      `json:"carbs_g,omitempty"`
	FiberG           int      `json:"fiber_g,omitempty"`
	WaterMl          int      `json:"water_ml,omitempty"`
	CaffeineMg       int      `json:"caffeine_mg,omitempty"`
	AlcoholG         int      `json:"alcohol_g,omitempty"`
	NicotineMg       int      `json:"nicotine_mg,omitempty"`
	DurationMin      int      `json:"duration_min,omitempty"`
	Micronutrients   []string `json:"micronutrients,omitempty"`
	Minerals         []string `json:"minerals,omitempty"`
	Vitamins         []string `json:"vitamins,omitempty"`
	EstimatedFrom    []string `json:"estimated_from,omitempty"`
	ReviewNeeded     []string `json:"review_needed,omitempty"`
	OriginalMimeType string   `json:"original_mime_type,omitempty"`
}

func BuildImageExtraction(input ImageExtractionRequest) ImageExtraction {
	name := strings.ToLower(filepath.Base(input.AssetName))
	mimeType := strings.ToLower(input.MimeType)
	imageBytes := decodedImageLength(input.ImageBase64)

	base := ImageExtraction{
		SchemaVersion: "2026-05-07.inputs-outputs.v1",
		Direction:     "input",
		InputCategory: "food",
		OutputImpacts: []string{"energy", "recovery", "health"},
		Title:         "Food input",
		Summary:       "Estimated food record. Review portion and nutrition before using it for trends.",
		Confidence:    0.68,
		Metadata: ExtractionMetadata{
			FoodCategory:     "mixed meal",
			PortionEstimate:  "one plate or bowl",
			WeightG:          420,
			CaloriesKcal:     540,
			ProteinG:         28,
			FatG:             18,
			CarbsG:           62,
			FiberG:           7,
			WaterMl:          180,
			Micronutrients:   []string{"fiber", "omega-3 estimate"},
			Minerals:         []string{"potassium", "magnesium"},
			Vitamins:         []string{"vitamin A", "vitamin C", "B vitamins"},
			EstimatedFrom:    []string{"asset_name", "source", "image_payload_presence"},
			ReviewNeeded:     []string{"portion size", "ingredients", "cooking oil", "sauce"},
			OriginalMimeType: mimeType,
		},
	}

	switch {
	case containsAny(name, "coffee", "cafe", "latte", "espresso", "matcha", "tea"):
		base.InputCategory = "caffeine"
		base.OutputImpacts = []string{"energy", "focus", "sleep"}
		base.Title = "Caffeine input"
		base.Summary = "Estimated caffeinated drink. Review size and milk or sugar additions."
		base.Confidence = 0.74
		base.Metadata = ExtractionMetadata{
			FoodCategory:     "caffeinated drink",
			PortionEstimate:  "one cup",
			CaloriesKcal:     90,
			ProteinG:         5,
			FatG:             3,
			CarbsG:           10,
			WaterMl:          240,
			CaffeineMg:       95,
			EstimatedFrom:    []string{"asset_name", "source"},
			ReviewNeeded:     []string{"drink size", "milk", "sweetener"},
			OriginalMimeType: mimeType,
		}
	case containsAny(name, "drink", "water", "juice", "smoothie"):
		base.InputCategory = "beverage"
		base.OutputImpacts = []string{"energy", "health"}
		base.Title = "Beverage input"
		base.Summary = "Estimated beverage record. Review volume and added sugar."
		base.Confidence = 0.7
		base.Metadata.WaterMl = 320
		base.Metadata.ReviewNeeded = []string{"volume", "sugar", "ingredients"}
	case containsAny(name, "beer", "wine", "cocktail", "alcohol"):
		base.InputCategory = "alcohol"
		base.OutputImpacts = []string{"sleep", "recovery", "mood"}
		base.Title = "Alcohol input"
		base.Summary = "Estimated alcohol record. Review serving size."
		base.Confidence = 0.72
		base.Metadata = ExtractionMetadata{
			PortionEstimate:  "one serving",
			CaloriesKcal:     140,
			CarbsG:           12,
			AlcoholG:         14,
			EstimatedFrom:    []string{"asset_name", "source"},
			ReviewNeeded:     []string{"serving size", "ABV"},
			OriginalMimeType: mimeType,
		}
	case containsAny(name, "nicotine", "smoke", "vape", "cigarette"):
		base.InputCategory = "nicotine"
		base.OutputImpacts = []string{"focus", "sleep", "recovery", "health"}
		base.Title = "Nicotine input"
		base.Summary = "Estimated nicotine record. Review amount and timing."
		base.Confidence = 0.7
		base.Metadata = ExtractionMetadata{
			PortionEstimate:  "one use",
			NicotineMg:       2,
			EstimatedFrom:    []string{"asset_name", "source"},
			ReviewNeeded:     []string{"amount", "delivery type", "timing"},
			OriginalMimeType: mimeType,
		}
	case containsAny(name, "run", "walk", "workout", "gym", "training", "lift"):
		base.InputCategory = "exercise"
		base.OutputImpacts = []string{"energy", "sleep", "recovery", "health"}
		base.Title = "Exercise input"
		base.Summary = "Estimated movement record. Review duration and intensity."
		base.Confidence = 0.72
		base.Metadata = ExtractionMetadata{
			DurationMin:      35,
			CaloriesKcal:     220,
			EstimatedFrom:    []string{"asset_name", "source"},
			ReviewNeeded:     []string{"duration", "intensity"},
			OriginalMimeType: mimeType,
		}
	case containsAny(name, "sun", "outside", "outdoor"):
		base.InputCategory = "sunlight"
		base.OutputImpacts = []string{"mood", "sleep", "health"}
		base.Title = "Sunlight input"
		base.Summary = "Estimated sunlight exposure record. Review duration."
		base.Confidence = 0.66
		base.Metadata = ExtractionMetadata{
			DurationMin:      20,
			EstimatedFrom:    []string{"asset_name", "source"},
			ReviewNeeded:     []string{"duration", "time of day"},
			OriginalMimeType: mimeType,
		}
	case containsAny(name, "message", "screen", "screenshot", "receipt", "doc", "pdf", "note"):
		base.InputCategory = "information"
		base.OutputImpacts = []string{"focus", "mood"}
		base.Title = "Information input"
		base.Summary = "Estimated information record from an imported file or screenshot."
		base.Confidence = 0.63
		base.Metadata = ExtractionMetadata{
			EstimatedFrom:    []string{"asset_name", "source"},
			ReviewNeeded:     []string{"context", "meaning"},
			OriginalMimeType: mimeType,
		}
	case containsAny(name, "friend", "family", "dinner", "party", "social"):
		base.InputCategory = "social"
		base.OutputImpacts = []string{"mood", "recovery", "health"}
		base.Title = "Social input"
		base.Summary = "Estimated social context record. Review who and where."
		base.Confidence = 0.62
		base.Metadata.ReviewNeeded = []string{"context", "people", "duration"}
	}

	if imageBytes > 0 {
		base.Confidence += 0.04
		if base.Confidence > 0.86 {
			base.Confidence = 0.86
		}
	}
	return base
}

func containsAny(value string, needles ...string) bool {
	for _, needle := range needles {
		if strings.Contains(value, needle) {
			return true
		}
	}
	return false
}

func decodedImageLength(encoded string) int {
	if encoded == "" {
		return 0
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return 0
	}
	return len(data)
}
