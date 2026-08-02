package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
)

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/", handleChat)
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	log.Printf("AG-UI Go server listening on http://127.0.0.1%s", listenAddr)
	if err := http.ListenAndServe(listenAddr, mux); err != nil {
		log.Fatal(err)
	}
}

func handleChat(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed to read body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	var input runAgentInput
	if err := json.Unmarshal(body, &input); err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}

	if input.ThreadID == "" || input.RunID == "" {
		http.Error(w, "threadId and runId are required", http.StatusBadRequest)
		return
	}

	stream, ok := beginSSE(w)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	stream.initRun(input.ThreadID, input.RunID)

	config := providerFromInput(input)
	system, messages := toChatMessages(input.Messages)
	if len(messages) == 0 {
		_ = stream.finishError("no user or assistant messages to send")
		stream.writeDone()
		return
	}

	err = stream.streamText(func(emit func(string) error) error {
		return streamCompletion(r.Context(), config, system, messages, emit)
	})
	if err != nil {
		log.Printf("[go] chat error: %v", err)
		_ = stream.finishError(err.Error())
		stream.writeDone()
	}
}
