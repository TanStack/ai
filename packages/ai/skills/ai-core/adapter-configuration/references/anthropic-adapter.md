# Anthropic Adapter Reference

## Package

```
@tanstack/ai-anthropic
```

## Adapter Factories

| Factory              | Type      | Description        |
| -------------------- | --------- | ------------------ |
| `anthropicText`      | Text/Chat | Chat completions   |
| `anthropicSummarize` | Summarize | Text summarization |

## Import

```typescript
import { anthropicText } from '@tanstack/ai-anthropic'
```

## Key Chat Models

| Model               | Context Window | Max Output | Notes                                       |
| ------------------- | -------------- | ---------- | ------------------------------------------- |
| `claude-fable-5`    | 1M             | 128K       | Most capable; thinking always on (adaptive) |
| `claude-sonnet-5`   | 1M             | 128K       | Best balance; adaptive thinking by default  |
| `claude-opus-4-8`   | 1M             | 128K       | Opus tier; adaptive thinking, no sampling   |
| `claude-opus-4-7`   | 1M             | 128K       | Older Opus; adaptive thinking, no sampling  |
| `claude-opus-4-6`   | 200K           | 128K       | Older Opus, adaptive + budget thinking      |
| `claude-sonnet-4-6` | 1M             | 64K        | Previous gen balanced, adaptive + budget    |
| `claude-sonnet-4-5` | 200K           | 64K        | Previous gen balanced                       |
| `claude-opus-4-5`   | 200K           | 32K        | Previous gen most capable                   |
| `claude-opus-4-1`   | 200K           | 64K        | Deprecated (retires 2026-08-05)             |
| `claude-haiku-4-5`  | 200K           | 64K        | Fast and affordable                         |

Note: Model IDs use the format `claude-sonnet-5`, `claude-opus-4-8`, etc.
Retired models (Claude 3.x, Sonnet 3.7, Opus 4 / Sonnet 4) and the `-fast`
variant ids were removed — every registered id resolves against the
first-party Anthropic API.

## Provider-Specific modelOptions

```typescript
chat({
  adapter: anthropicText('claude-sonnet-4-6'),
  messages,
  modelOptions: {
    // Sampling
    temperature: 0.7,
    top_p: 0.9, // cannot be combined with temperature
    max_tokens: 16000,
    // Extended thinking (budget-based)
    thinking: {
      type: 'enabled',
      budget_tokens: 8000, // must be >= 1024 and < max_tokens
    },
    // Adaptive thinking (claude-sonnet-4-6, claude-opus-4-6+)
    thinking: {
      type: 'adaptive',
    },
    effort: 'high', // 'max' | 'high' | 'medium' | 'low'
    // Service tier
    service_tier: 'auto', // 'auto' | 'standard_only'
    // Stop sequences
    stop_sequences: ['END'],
    // Tool choice
    tool_choice: { type: 'auto' },
    // Context management
    context_management: {
      /* BetaContextManagementConfig */
    },
    // MCP servers (max 20)
    mcp_servers: [
      {
        name: 'my-server',
        url: 'https://mcp.example.com',
        type: 'url',
        tool_configuration: { enabled: true },
      },
    ],
    // Container (skills)
    container: {
      id: 'container-id',
      skills: [{ skill_id: 'analysis', type: 'anthropic' }],
    },
    // Sampling
    top_k: 40,
  },
})
```

## Environment Variable

```
ANTHROPIC_API_KEY
```

## Adaptive-era modelOptions (Sonnet 5, Fable 5, Opus 4.7/4.8)

The per-model types restrict `modelOptions` on the newest models:

```typescript
chat({
  adapter: anthropicText('claude-sonnet-5'), // or 'claude-fable-5', 'claude-opus-4-8'
  messages,
  modelOptions: {
    // Adaptive thinking only — budget_tokens is rejected (400).
    // On claude-fable-5, { type: 'disabled' } is also rejected;
    // elsewhere it opts out of thinking.
    thinking: { type: 'adaptive', display: 'summarized' },
    // Effort lives under output_config; 'xhigh' is available on
    // Opus 4.7+, Sonnet 5, and Fable 5.
    output_config: { effort: 'xhigh' },
    max_tokens: 64_000,
    // NO temperature / top_p / top_k — the API rejects them on these models
  },
})
```

## Gotchas

- `thinking.budget_tokens` must be >= 1024 AND less than `modelOptions.max_tokens`.
  Failing either check throws a validation error.
- Cannot set both `top_p` and `temperature` at the same time (throws error).
- `claude-sonnet-5`, `claude-fable-5`, `claude-opus-4-8`, and
  `claude-opus-4-7` do NOT accept `temperature`, `top_p`, `top_k`, or
  `thinking: { type: 'enabled', budget_tokens }` — adaptive thinking +
  `output_config.effort` replace them (typed per model).
- System prompts support prompt caching via `cache_control` on `TextBlockParam[]`.
- All Claude models accept `text`, `image`, and `document` (PDF) input.
