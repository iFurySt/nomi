package app

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestPostgresProvisionedReviewHouseholdIsIsolated(t *testing.T) {
	databaseURL := os.Getenv("NOMI_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("NOMI_TEST_DATABASE_URL is not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	store := NewPostgresStore(pool)
	if err = store.EnsureSchema(ctx); err != nil {
		t.Fatal(err)
	}
	realPassword, err := hashPassword("real-family-password")
	if err != nil {
		t.Fatal(err)
	}
	real, err := store.CreateOwner(ctx, "owner@example.com", realPassword, "Family Owner", "Real Family")
	if err != nil {
		t.Fatal(err)
	}
	reviewPassword, err := hashPassword("review-password")
	if err != nil {
		t.Fatal(err)
	}
	review, err := store.ProvisionIsolatedOwner(ctx, "review@example.com", reviewPassword, "App Review", "Review Demo")
	if err != nil {
		t.Fatal(err)
	}
	if real.Household.ID == review.Household.ID {
		t.Fatal("review account joined the real household")
	}
	realPeople, err := store.ListPeople(ctx, real.Household.ID)
	if err != nil {
		t.Fatal(err)
	}
	reviewPeople, err := store.ListPeople(ctx, review.Household.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(realPeople) != 1 || realPeople[0].DisplayName != "Family Owner" {
		t.Fatalf("real people=%#v", realPeople)
	}
	if len(reviewPeople) != 1 || reviewPeople[0].DisplayName != "App Review" {
		t.Fatalf("review people=%#v", reviewPeople)
	}
	assetID, err := newID()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = store.CreateAsset(ctx, Asset{ID: assetID, HouseholdID: real.Household.ID, CreatedBy: real.User.ID, StorageProvider: "fs", StorageKey: "households/real/review-isolation.txt", OriginalName: "private.txt", MimeType: "text/plain", SizeBytes: 7, SHA256: "private", Status: JobStatusQueued}); err != nil {
		t.Fatal(err)
	}
	if _, err = store.GetAsset(ctx, review.Household.ID, assetID); err != ErrNotFound {
		t.Fatalf("cross-household lookup error=%v", err)
	}
}
