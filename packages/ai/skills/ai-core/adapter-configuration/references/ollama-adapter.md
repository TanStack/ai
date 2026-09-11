# Ollama Adapter Reference

## Package

```
@tanstack/ai-ollama
```

## Adapter Factories

| Factory           | Type      | Description        |
| ----------------- | --------- | ------------------ |
| `ollamaText`      | Text/Chat | Chat completions   |
| `ollamaSummarize` | Summarize | Text summarization |

## Import

```typescript
import { ollamaText } from '@tanstack/ai-ollama'
```

## Key Models (Local)

Ollama runs models locally. The adapter supports a large catalog of models.
Key families include:

| Model Family | Example Names                            | Notes                   |
| ------------ | ---------------------------------------- | ----------------------- |
| Llama 4      | `llama4:latest`, `llama4:16x17b`         | Latest Meta models      |
| Llama 3.3    | `llama3.3:latest`, `llama3.3:70b`        | Strong general purpose  |
| Qwen 3       | `qwen3:latest`, `qwen3:32b`              | Reasoning capable       |
| DeepSeek R1  | `deepseek-r1:latest`, `deepseek-r1:70b`  | Reasoning focused       |
| Gemma 3      | `gemma3:latest`, `gemma3:27b`            | Google's open model     |
| Phi 4        | `phi4:latest`, `phi4:14b`                | Microsoft's small model |
| Mistral      | `mistral:latest`, `mistral-large:latest` | Mistral AI models       |

Typed ids are always `family:tag` (`OLLAMA_TEXT_MODELS`). `ollamaText()`
accepts any string, but a bare `llama3.3` falls outside the typed catalog and
`modelOptions` degrades to the raw Ollama `ChatRequest` (which then demands a
`model` field). Use `llama3.3:latest`.

Models must be pulled first: `ollama pull llama3.3`

## Provider-Specific modelOptions

Ollama models use a generic options type. Provider options vary by the
underlying model. The adapter passes options through to the Ollama API.
Sampling options are **nested** under `modelOptions.options` (this matches
Ollama's own request shape) — `temperature`, `top_p`, and `num_predict`
(max output tokens) all live there.

```typescript
import { chat } from '@tanstack/ai'
import { ollamaText } from '@tanstack/ai-ollama'

const messages = [{ role: 'user' as const, content: 'Hello' }]

const stream = chat({
  adapter: ollamaText('llama3.3:latest'),
  messages,
  modelOptions: {
    options: {
      temperature: 0.7,
      top_p: 0.9,
      num_predict: 1000, // max output tokens
    },
  },
  // Ollama-specific options are limited compared to cloud providers
})
```

## Configuration

`ollamaText(model)` takes no config — it reads `OLLAMA_HOST`. To point at
another server (or pass headers / `baseURL` for a gateway), use
`createOllamaChat(model, hostOrConfig)`:

```typescript
import { createOllamaChat } from '@tanstack/ai-ollama'

// With explicit host (ollamaText() reads OLLAMA_HOST instead)
const adapter = createOllamaChat('llama3.3:latest', {
  host: 'http://my-server:11434',
})
```

## Environment Variable

```
OLLAMA_HOST  (default: http://localhost:11434)
```

No API key is needed. Ollama runs locally by default.

## Gotchas

- **System prompts:** Pass system prompts via the `systemPrompts` option in `chat()`.
- Ollama requires models to be downloaded first (`ollama pull <model>`).
  The adapter does not auto-download models.
- The model catalog is very large (60+ model families). Model names follow
  Ollama's naming: `family:variant` (e.g., `llama3.3:70b`).
- Vision models (e.g., `llama3.2-vision`, `llava`, `gemma3`) support
  image input. Text-only models do not.
- No image generation, TTS, or transcription adapters for Ollama.
