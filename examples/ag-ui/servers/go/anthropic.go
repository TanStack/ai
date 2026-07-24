package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
)

func streamAnthropic(
	ctx context.Context,
	model string,
	system string,
	messages []chatMessage,
	emit func(string) error,
) error {
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey == "" {
		return fmt.Errorf("ANTHROPIC_API_KEY is not set")
	}

	anthropicMessages := make([]map[string]string, 0, len(messages))
	for _, msg := range messages {
		anthropicMessages = append(anthropicMessages, map[string]string{
			"role":    msg.Role,
			"content": msg.Content,
		})
	}

	body := map[string]any{
		"model":      model,
		"max_tokens": 4096,
		"messages":   anthropicMessages,
		"stream":     true,
	}
	if system != "" {
		body["system"] = system
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		"https://api.anthropic.com/v1/messages",
		bytes.NewReader(payload),
	)
	if err != nil {
		return err
	}
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("anthropic request failed (%d): %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		data := strings.TrimPrefix(line, "data: ")
		var event struct {
			Type  string `json:"type"`
			Delta struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"delta"`
		}
		if err := json.Unmarshal([]byte(data), &event); err != nil {
			continue
		}
		if event.Type != "content_block_delta" || event.Delta.Type != "text_delta" {
			continue
		}
		if err := emit(event.Delta.Text); err != nil {
			return err
		}
	}

	return scanner.Err()
}
