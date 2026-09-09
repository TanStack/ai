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
import { chat } from '@tanstack/ai'
import { openRouterText } from '@tanstack/ai-openrouter'

const messages = [{ role: 'user' as const, content: 'Hello' }]

// Options are narrowed per model from OpenRouter's published metadata —
// e.g. 'anthropic/claude-sonnet-4' only accepts temperature/topP/
// maxCompletionTokens/stop/toolChoice/reasoning. This model takes the full set.
chat({
  adapter: openRouterText('deepseek/deepseek-v4-pro'),
  messages,
  modelOptions: {
    // Reasoning
    reasoning: {
      effort: 'high', // 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
      summary: 'auto',
      // enabled: false — explicit opt-out (normalized to effort: 'none')
    },
    // Sampling
    temperature: 0.7,
    topP: 0.9,
    frequencyPenalty: 0.5,
    presencePenalty: 0.5,
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
    // Routing (available on every model)
    variant: 'nitro', // 'free' | 'nitro' | 'online' | 'exacto' | 'extended' | 'thinking'
    models: ['deepseek/deepseek-v4-flash'], // fallbacks, tried in order
    provider: { order: ['DeepSeek'], allowFallbacks: true },
    plugins: [{ id: 'web' }], // web search
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
  - `variant` option: `'free'`, `'nitro'`, `'online'`, `'exacto'`,
    `'extended'`, `'thinking'`
  - `provider` routing preferences (`order`, `allowFallbacks`, data
    collection policies — camelCase keys)
  - `models` array of fallback ids, tried in order
  - `plugins: [{ id: 'web' }]` for web search (also `file-parser`,
    `response-healing`, `moderation`, `auto-router`)
- Uses `camelCase` for option names (e.g., `topP`, `frequencyPenalty`,
  `maxCompletionTokens`), unlike OpenAI's `snake_case`.
- `reasoning` is `{ effort, summary, enabled }` — there is no
  `max_tokens`/`exclude` inside it; `enabled: false` is normalized to
  `effort: 'none'`.
- Per-model options are narrowed from OpenRouter's published metadata, so
  keys like `frequencyPenalty`, `seed`, `logprobs`, or `responseFormat` are
  only accepted on models that support them. `topK`, `minP`,
  `repetitionPenalty`, `webSearchOptions`, `verbosity`, `transforms`, and
  `route` are not exposed by the adapter.
