package main

import (
	"context"
	"fmt"
)

func streamCompletion(
	ctx context.Context,
	config providerConfig,
	system string,
	messages []chatMessage,
	emit func(string) error,
) error {
	switch config.Provider {
	case "openai":
		return streamOpenAI(ctx, config.Model, system, messages, emit)
	case "anthropic":
		return streamAnthropic(ctx, config.Model, system, messages, emit)
	default:
		return fmt.Errorf("unsupported provider %q (expected openai or anthropic)", config.Provider)
	}
}
