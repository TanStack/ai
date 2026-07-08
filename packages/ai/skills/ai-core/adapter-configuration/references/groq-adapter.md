# Groq Adapter Reference

## Package

```
@tanstack/ai-groq
```

## Adapter Factories

| Factory    | Type      | Description      |
| ---------- | --------- | ---------------- |
| `groqText` | Text/Chat | Chat completions |

Groq currently only has a text adapter (no image, TTS, etc.).

## Import

```typescript
import { groqText } from '@tanstack/ai-groq'
```

## Key Chat Models

| Model                                           | Context Window | Notes                     |
| ----------------------------------------------- | -------------- | ------------------------- |
| `llama-3.3-70b-versatile`                       | 131K           | General purpose           |
| `meta-llama/llama-4-maverick-17b-128e-instruct` | 131K           | Vision, JSON schema       |
| `meta-llama/llama-4-scout-17b-16e-instruct`     | 131K           | Vision, tool calling      |
| `openai/gpt-oss-120b`                           | 131K           | Reasoning, browser search |
| `openai/gpt-oss-20b`                            | 131K           | Budget reasoning          |
| `qwen/qwen3-32b`                                | 131K           | Reasoning, tool calling   |
| `moonshotai/kimi-k2-instruct-0905`              | 262K           | Large context             |
| `llama-3.1-8b-instant`                          | 131K           | Ultra-fast, budget        |

Guard models: `meta-llama/llama-guard-4-12b`, `meta-llama/llama-prompt-guard-2-86m`

## Provider-Specific modelOptions

```typescript
chat({
  adapter: groqText('llama-3.3-70b-versatile'),
  messages,
  modelOptions: {
    // Reasoning
    reasoning_effort: 'medium', // 'none' | 'default' | 'low' | 'medium' | 'high'
    reasoning_format: 'parsed', // 'hidden' | 'raw' | 'parsed' (mutually exclusive with include_reasoning)
    include_reasoning: true, // mutually exclusive with reasoning_format
    // Response format
    response_format: {
      type: 'json_schema',
      json_schema: {
        /* ... */
      },
    },
    // Sampling
    temperature: 0.7,
    top_p: 0.9,
    frequency_penalty: 0.5,
    presence_penalty: 0.5,
    seed: 42,
    stop: ['\n\n'],
    // Token limits
    max_completion_tokens: 8192,
    // Tool calling
    tool_choice: 'auto',
    parallel_tool_calls: true,
    disable_tool_validation: false,
    // Citations
    citation_options: 'enabled',
    // Documents for context
    documents: [{ text: '...' }],
    // Search settings (for web search tool)
    search_settings: {
      /* SearchSettings */
    },
    // Service tier
    service_tier: 'auto', // 'auto' | 'on_demand' | 'flex' | 'performance'
    // Metadata
    metadata: { session: 'abc' },
    // Logging
    logprobs: true,
    top_logprobs: 5,
    // User tracking
    user: 'user-123',
  },
})
```

## Environment Variable

```
GROQ_API_KEY
```

## Gotchas

- `reasoning_effort` and `reasoning_format` behave differently per model:
  - qwen3 models: `'none'` disables reasoning, `'default'` or null enables it
  - openai/gpt-oss models: `'low'`, `'medium'` (default), or `'high'`
- `include_reasoning` and `reasoning_format` are mutually exclusive.
- Most models have `max_completion_tokens` of 8K-65K, not unlimited.
- Groq specializes in inference speed; model selection is more limited
  than other providers.
- Guard models (`llama-guard-4-12b`, `llama-prompt-guard-2-*`) are for
  content moderation, not general chat.
