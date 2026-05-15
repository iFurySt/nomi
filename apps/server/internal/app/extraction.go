package app

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
	DocumentKind     string   `json:"document_kind,omitempty"`
	DocumentDate     string   `json:"document_date,omitempty"`
	Issuer           string   `json:"issuer,omitempty"`
	Currency         string   `json:"currency,omitempty"`
	TotalAmount      string   `json:"total_amount,omitempty"`
	EstimatedFrom    []string `json:"estimated_from,omitempty"`
	ReviewNeeded     []string `json:"review_needed,omitempty"`
	OriginalMimeType string   `json:"original_mime_type,omitempty"`
}
