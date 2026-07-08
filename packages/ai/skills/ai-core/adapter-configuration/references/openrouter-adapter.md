# OpenRouter Adapter Reference

## Package

```
@tanstack/ai-openrouter
```

## Adapter Factories

| Factory               | Type      | Description        |
| --------------------- | --------- | ------------------ |
| `openRouterText`      | Text/Chat | Chat completions   |
| `openRouterImage`     | Image     | Image generation   |
| `openRouterSummarize` | Summarize | Text summarization |

## Import

```typescript
import { openRouterText } from '@tanstack/ai-openrouter'
```

## Key Models

OpenRouter routes to hundreds of models across providers. Model IDs use
the format `provider/model-name`:

| Model ID                      | Notes                      |
| ----------------------------- | -------------------------- |
| `anthropic/claude-sonnet-4`   | Claude via OpenRouter      |
| `openai/gpt-5.2`              | GPT-5.2 via OpenRouter     |
| `google/gemini-2.5-pro`       | Gemini via OpenRouter      |
| `meta-llama/llama-4-maverick` | Open-source via OpenRouter |
| `deepseek/deepseek-r1`        | Reasoning model            |

## Provider-Specific modelOptions

OpenRouter has unique routing and provider selection options:

```typescript
chat({
  adapter: openRouterText('anthropic/claude-sonnet-4'),
  messages,
  modelOptions: {
    // Reasoning
    reasoning: {
      effort: 'high', // 'none' | 'minimal' | 'low' | 'medium' | 'high'
      max_tokens: 4096,
      exclude: false,
    },
    // Sampling
    temperature: 0.7,
    topP: 0.9,
    topK: 40,
    frequencyPenalty: 0.5,
    presencePenalty: 0.5,
    repetitionPenalty: 1.1,
    minP: 0.05,
    seed: 42,
    // Token limits
    maxCompletionTokens: 8192,
    // Stop sequences
    stop: ['\n\n'],
    // Tool calling
    toolChoice: 'auto',
    parallelToolCalls: true,
    // Response format
    responseFormat: { type: 'json_object' },
    // Web search
    webSearchOptions: {
      search_context_size: 'medium', // 'low' | 'medium' | 'high'
    },
    // Verbosity
    verbosity: 'medium',
    // Logprobs
    logprobs: true,
    topLogprobs: 5,
  },
})
```

## Environment Variable

```
OPENROUTER_API_KEY
```

## Gotchas

- Model IDs are `provider/model-name` format (e.g., `openai/gpt-5.2`).
- OpenRouter has unique features not found in direct provider adapters:
  - `variant` option: `'free'`, `'nitro'`, `'online'`, `'thinking'`, etc.
  - `provider` routing preferences (order, fallbacks, data collection policies)
  - `transforms: ['middle-out']` for context compression
  - `prediction` for latency reduction
  - `plugins: [{ id: 'web' }]` for web search
- Uses `camelCase` for option names (e.g., `topP`, `frequencyPenalty`),
  unlike OpenAI's `snake_case`.
- `route: 'fallback'` with `models` array tries models in order.
