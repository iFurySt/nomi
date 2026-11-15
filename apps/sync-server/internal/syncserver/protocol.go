package syncserver

import (
	"bytes"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"
)

const Protocol = "nomi-sync/v1"
const MaxBody = 4 << 20
const MaxEntities = 4000

var validID = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9_.-]{0,95}$`)
var validHash = regexp.MustCompile(`^[a-f0-9]{64}$`)

type Record struct {
	Kind      string          `json:"kind"`
	ID        string          `json:"id"`
	Version   int64           `json:"version"`
	Deleted   bool            `json:"deleted"`
	Data      json.RawMessage `json:"data"`
	UpdatedAt time.Time       `json:"updatedAt"`
}
type Mutation struct {
	Kind        string          `json:"kind"`
	ID          string          `json:"id"`
	BaseVersion int64           `json:"baseVersion"`
	Deleted     bool            `json:"deleted"`
	Data        json.RawMessage `json:"data"`
}
type Commit struct {
	Protocol  string     `json:"protocol"`
	RequestID string     `json:"requestId"`
	Mutations []Mutation `json:"mutations"`
}
type Version struct {
	Kind    string `json:"kind"`
	ID      string `json:"id"`
	Version int64  `json:"version"`
}
type Receipt struct {
	Sequence int64     `json:"sequence"`
	Versions []Version `json:"versions"`
}
type Snapshot struct {
	Protocol string   `json:"protocol"`
	Cursor   int64    `json:"cursor"`
	Records  []Record `json:"records"`
}
type Change struct {
	Sequence int64    `json:"sequence"`
	Records  []Record `json:"records"`
}
type Changes struct {
	Protocol string   `json:"protocol"`
	Cursor   int64    `json:"cursor"`
	HasMore  bool     `json:"hasMore"`
	Changes  []Change `json:"changes"`
}
type APIError struct {
	Status    int      `json:"-"`
	Code      string   `json:"code"`
	Message   string   `json:"message"`
	Conflicts []Record `json:"conflicts,omitempty"`
}

func (e *APIError) Error() string { return e.Code + ": " + e.Message }
func problem(status int, code, msg string) error {
	return &APIError{Status: status, Code: code, Message: msg}
}
func key(kind, id string) string { return kind + ":" + id }
func validKind(k string) bool {
	switch k {
	case "document", "note", "order", "block", "asset", "board":
		return true
	}
	return false
}
func safeID(id string) bool {
	return validID.MatchString(id) && id != "constructor" && id != "prototype" && id != "__proto__"
}
func canonical(raw []byte) ([]byte, error) {
	d := json.NewDecoder(bytes.NewReader(raw))
	d.UseNumber()
	var v any
	if err := d.Decode(&v); err != nil {
		return nil, err
	}
	count := 0
	var check func(any, int) error
	check = func(v any, depth int) error {
		count++
		if depth > 48 || count > 40000 {
			return fmt.Errorf("JSON budget exceeded")
		}
		switch x := v.(type) {
		case map[string]any:
			for k, c := range x {
				if k == "__proto__" || k == "constructor" || k == "prototype" {
					return fmt.Errorf("unsafe JSON key")
				}
				if err := check(c, depth+1); err != nil {
					return err
				}
			}
		case []any:
			if len(x) > 4000 {
				return fmt.Errorf("array too long")
			}
			for _, c := range x {
				if err := check(c, depth+1); err != nil {
					return err
				}
			}
		}
		return nil
	}
	if err := check(v, 0); err != nil {
		return nil, err
	}
	return json.Marshal(v)
}
func validateCommit(c *Commit) error {
	if c.Protocol != Protocol {
		return problem(422, "unsupported_protocol", "Unsupported sync protocol")
	}
	if !safeID(c.RequestID) || len(c.Mutations) == 0 || len(c.Mutations) > 1000 {
		return problem(400, "invalid_commit", "Invalid request ID or mutation count")
	}
	seen := map[string]bool{}
	for i := range c.Mutations {
		m := &c.Mutations[i]
		if !validKind(m.Kind) || !safeID(m.ID) || m.BaseVersion < 0 || seen[key(m.Kind, m.ID)] {
			return problem(400, "invalid_mutation", "Invalid or duplicate entity")
		}
		seen[key(m.Kind, m.ID)] = true
		if m.Deleted {
			if m.BaseVersion == 0 {
				return problem(400, "invalid_mutation", "Cannot delete an unknown entity")
			}
			m.Data = nil
			continue
		}
		raw, err := canonical(m.Data)
		if err != nil || len(raw) > 2<<20 {
			return problem(422, "invalid_content", "Invalid JSON or oversized block")
		}
		var obj map[string]json.RawMessage
		if json.Unmarshal(raw, &obj) != nil || obj == nil {
			return problem(422, "invalid_content", "Entity data must be an object")
		}
		var id string
		_ = json.Unmarshal(obj["id"], &id)
		if id != m.ID {
			return problem(422, "invalid_content", "Entity ID does not match")
		}
		m.Data = raw
	}
	return nil
}
func object(r Record) map[string]any                { var v map[string]any; _ = json.Unmarshal(r.Data, &v); return v }
func stringField(o map[string]any, k string) string { s, _ := o[k].(string); return s }
func idsField(o map[string]any, k string) ([]string, bool) {
	a, ok := o[k].([]any)
	if !ok {
		return nil, false
	}
	out := []string{}
	seen := map[string]bool{}
	for _, v := range a {
		s, ok := v.(string)
		if !ok || !safeID(s) || seen[s] {
			return nil, false
		}
		seen[s] = true
		out = append(out, s)
	}
	return out, true
}

// Graph validation is performed on the whole candidate state while its space is locked.
// Renderers additionally validate native DSL capabilities before applying remote content.
func validateGraph(records map[string]Record) error {
	if len(records) > MaxEntities {
		return problem(422, "entity_limit", "Too many entities")
	}
	exists := func(kind, id string) bool { r, ok := records[key(kind, id)]; return ok && !r.Deleted }
	parents := map[string]string{}
	documents := 0
	boards := 0
	contentBytes := 0
	for _, r := range records {
		if r.Deleted {
			continue
		}
		contentBytes += len(r.Data)
		if contentBytes > MaxBody {
			return problem(422, "content_limit", "Library content exceeds sync budget")
		}
		o := object(r)
		switch r.Kind {
		case "document":
			documents++
			if stringField(o, "schema") != "nomi-document-ir/draft-1" {
				return problem(422, "unsupported_schema", "Unsupported document schema")
			}
			ids, ok := idsField(o, "noteOrder")
			if !ok {
				return problem(422, "invalid_order", "Missing note order")
			}
			for _, id := range ids {
				if !exists("note", id) {
					return problem(422, "missing_reference", "Unknown note")
				}
			}
			if len(ids) != countKind(records, "note") {
				return problem(422, "invalid_order", "Note order must include each note")
			}
		case "note":
			p := stringField(o, "parentId")
			if p != "" && !exists("note", p) {
				return problem(422, "missing_reference", "Unknown parent")
			}
			parents[r.ID] = p
			if !exists("order", r.ID) {
				return problem(422, "missing_reference", "Note order required")
			}
		case "order":
			if !exists("note", r.ID) {
				return problem(422, "missing_reference", "Unknown note for block order")
			}
			ids, ok := idsField(o, "blocks")
			if !ok {
				return problem(422, "invalid_order", "Invalid block order")
			}
			for _, id := range ids {
				if !exists("block", id) {
					return problem(422, "missing_reference", "Unknown block")
				}
			}
		case "block":
			t := stringField(o, "type")
			switch t {
			case "markdown":
				if _, ok := o["source"].(string); !ok {
					return problem(422, "invalid_content", "Markdown source required")
				}
			case "interactive":
				if _, ok := o["program"].(map[string]any); !ok {
					return problem(422, "invalid_content", "Program required")
				}
			case "canvas":
				if _, ok := o["scene"].(map[string]any); !ok {
					return problem(422, "invalid_content", "Scene required")
				}
			case "image", "file":
				if !exists("asset", stringField(o, "asset")) {
					return problem(422, "missing_reference", "Unknown attachment")
				}
			case "shape", "drawing", "note-reference":
			default:
				return problem(422, "unsupported_type", "Unsupported block type")
			}
		case "asset":
			if !validHash.MatchString(stringField(o, "sha256")) {
				return problem(422, "invalid_asset", "Invalid digest")
			}
			size, ok := o["bytes"].(float64)
			if !ok || size < 0 || size > 20<<20 || size != float64(int64(size)) {
				return problem(422, "invalid_asset", "Invalid attachment size")
			}
			if !strings.Contains(stringField(o, "mime"), "/") {
				return problem(422, "invalid_asset", "Invalid MIME")
			}
		case "board":
			boards++
			placements, ok := o["placements"].([]any)
			if !ok {
				return problem(422, "invalid_structure", "Placements required")
			}
			placementIDs := map[string]bool{}
			for _, value := range placements {
				p, ok := value.(map[string]any)
				id := stringField(p, "id")
				if !ok || !safeID(id) || placementIDs[id] || (!exists("block", stringField(p, "content")) && !exists("note", stringField(p, "content"))) {
					return problem(422, "missing_reference", "Invalid board placement")
				}
				placementIDs[id] = true
			}
			if connectors, ok := o["connectors"].([]any); ok {
				for _, value := range connectors {
					c, ok := value.(map[string]any)
					if !ok {
						return problem(422, "invalid_structure", "Invalid connector")
					}
					for _, side := range []string{"from", "to"} {
						e, ok := c[side].(map[string]any)
						if !ok {
							return problem(422, "invalid_structure", "Connector endpoint required")
						}
						if p := stringField(e, "placement"); p != "" && !placementIDs[p] {
							return problem(422, "missing_reference", "Unknown placement")
						}
					}
				}
			}
		}
		// All explicit asset fields, including nested canvas / icon references, must resolve.
		if r.Kind == "block" || r.Kind == "note" {
			var check func(any) bool
			check = func(v any) bool {
				switch x := v.(type) {
				case map[string]any:
					for k, a := range x {
						if k == "asset" {
							id, ok := a.(string)
							if !ok || !exists("asset", id) {
								return false
							}
						}
						if !check(a) {
							return false
						}
					}
				case []any:
					for _, a := range x {
						if !check(a) {
							return false
						}
					}
				}
				return true
			}
			if !check(o) {
				return problem(422, "missing_reference", "Unknown nested attachment")
			}
		}
	}
	if documents > 1 || boards > 1 || (contentBytes > 0 && (documents != 1 || boards != 1)) {
		return problem(422, "invalid_structure", "One document and board per space")
	}
	for id := range parents {
		seen := map[string]bool{}
		for p := id; p != ""; p = parents[p] {
			if seen[p] {
				return problem(422, "parent_cycle", "Document tree cannot contain cycles")
			}
			seen[p] = true
		}
	}
	return nil
}
func countKind(records map[string]Record, kind string) int {
	n := 0
	for _, r := range records {
		if r.Kind == kind && !r.Deleted {
			n++
		}
	}
	return n
}
