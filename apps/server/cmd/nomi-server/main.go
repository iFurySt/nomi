package main

import (
	"log"

	"github.com/iFurySt/nomi/apps/server/internal/app"
)

func main() {
	if err := app.NewRootCommand().Execute(); err != nil {
		log.Fatal(err)
	}
}
