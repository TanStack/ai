package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

const listenAddr = ":8001"

const (
	defaultOpenAIModel    = "gpt-4o"
	defaultAnthropicModel = "claude-sonnet-4-6"
)

type runAgentInput struct {
	ThreadID       string            `json:"threadId"`
	RunID          string            `json:"runId"`
	Messages       []incomingMessage `json:"messages"`
	ForwardedProps map[string]any    `json:"forwardedProps"`
	Data           map[string]any    `json:"data"`
}

type incomingMessage struct {
	Role    string          `json:"role"`
	Content json.RawMessage `json:"content"`
	Parts   []messagePart   `json:"parts"`
}

type messagePart struct {
	Type    string `json:"type"`
	Content string `json:"content"`
}

type chatMessage struct {
	Role    string
	Content string
}

type providerConfig struct {
	Provider string
	Model    string
}

type sseStream struct {
	w          http.ResponseWriter
	flusher    http.Flusher
	threadID   string
	runID      string
	messageID  string
	started    bool
	textOpened bool
}

func propsFromInput(input runAgentInput) map[string]any {
	if len(input.ForwardedProps) > 0 {
		return input.ForwardedProps
	}
	return input.Data
}

func providerFromInput(input runAgentInput) providerConfig {
	props := propsFromInput(input)
	provider := "openai"
	model := ""

	if raw, ok := props["provider"].(string); ok && raw != "" {
		provider = raw
	}
	if raw, ok := props["model"].(string); ok && raw != "" {
		model = raw
	}

	switch provider {
	case "anthropic":
		if model == "" {
			model = defaultAnthropicModel
		}
	default:
		provider = "openai"
		if model == "" {
			model = defaultOpenAIModel
		}
	}

	return providerConfig{Provider: provider, Model: model}
}

func beginSSE(w http.ResponseWriter) (*sseStream, bool) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		return nil, false
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(http.StatusOK)

	return &sseStream{w: w, flusher: flusher}, true
}

func (s *sseStream) initRun(threadID, runID string) {
	s.threadID = threadID
	s.runID = runID
	s.messageID = fmt.Sprintf("msg-%s", runID)
}

func (s *sseStream) writeEvent(payload map[string]any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(s.w, "data: %s\n\n", data)
	if err != nil {
		return err
	}
	s.flusher.Flush()
	return nil
}

func (s *sseStream) writeDone() {
	_, _ = fmt.Fprint(s.w, "data: [DONE]\n\n")
	s.flusher.Flush()
}

func (s *sseStream) startRun() error {
	if s.started {
		return nil
	}
	s.started = true
	return s.writeEvent(map[string]any{
		"type":     "RUN_STARTED",
		"threadId": s.threadID,
		"runId":    s.runID,
	})
}

func (s *sseStream) startText() error {
	if s.textOpened {
		return nil
	}
	s.textOpened = true
	return s.writeEvent(map[string]any{
		"type":      "TEXT_MESSAGE_START",
		"messageId": s.messageID,
		"role":      "assistant",
	})
}

func (s *sseStream) writeDelta(delta string) error {
	if delta == "" {
		return nil
	}
	return s.writeEvent(map[string]any{
		"type":      "TEXT_MESSAGE_CONTENT",
		"messageId": s.messageID,
		"delta":     delta,
	})
}

func (s *sseStream) finishSuccess() error {
	if s.textOpened {
		if err := s.writeEvent(map[string]any{
			"type":      "TEXT_MESSAGE_END",
			"messageId": s.messageID,
		}); err != nil {
			return err
		}
	}
	return s.writeEvent(map[string]any{
		"type":         "RUN_FINISHED",
		"threadId":     s.threadID,
		"runId":        s.runID,
		"finishReason": "stop",
	})
}

func (s *sseStream) finishError(message string) error {
	if !s.started {
		if err := s.startRun(); err != nil {
			return err
		}
	}
	return s.writeEvent(map[string]any{
		"type":     "RUN_ERROR",
		"threadId": s.threadID,
		"runId":    s.runID,
		"error": map[string]any{
			"message": message,
		},
	})
}

func (s *sseStream) streamText(stream func(emit func(string) error) error) error {
	if err := s.startRun(); err != nil {
		return err
	}
	if err := s.startText(); err != nil {
		return err
	}
	if err := stream(s.writeDelta); err != nil {
		return err
	}
	if err := s.finishSuccess(); err != nil {
		return err
	}
	s.writeDone()
	return nil
}
