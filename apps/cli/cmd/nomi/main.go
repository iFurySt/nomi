package main

import (
	"context"
	"fmt"
	"github.com/ifuryst/nomi/apps/cli/internal/command"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := command.New().ExecuteContext(ctx); err != nil {
		fmt.Fprintln(os.Stderr, "nomi:", err)
		os.Exit(1)
	}
}
