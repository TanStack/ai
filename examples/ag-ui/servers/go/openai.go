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

func streamOpenAI(
	ctx context.Context,
	model string,
	system string,
	messages []chatMessage,
	emit func(string) error,
) error {
	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		return fmt.Errorf("OPENAI_API_KEY is not set")
	}

	openAIMessages := make([]map[string]string, 0, len(messages)+1)
	if system != "" {
		openAIMessages = append(openAIMessages, map[string]string{
			"role":    "system",
			"content": system,
		})
	}
	for _, msg := range messages {
		openAIMessages = append(openAIMessages, map[string]string{
			"role":    msg.Role,
			"content": msg.Content,
		})
	}

	payload, err := json.Marshal(map[string]any{
		"model":    model,
		"messages": openAIMessages,
		"stream":   true,
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		"https://api.openai.com/v1/chat/completions",
		bytes.NewReader(payload),
	)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("openai request failed (%d): %s", resp.StatusCode, strings.TrimSpace(string(body)))
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
		if data == "[DONE]" {
			break
		}

		var chunk struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}
		if len(chunk.Choices) == 0 {
			continue
		}
		if err := emit(chunk.Choices[0].Delta.Content); err != nil {
			return err
		}
	}

	return scanner.Err()
}
