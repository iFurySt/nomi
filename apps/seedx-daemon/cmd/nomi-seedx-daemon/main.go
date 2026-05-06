package main

import (
	"log"

	"github.com/iFurySt/nomi/apps/seedx-daemon/internal/app"
)

func main() {
	if err := app.NewRootCommand().Execute(); err != nil {
		log.Fatal(err)
	}
}
