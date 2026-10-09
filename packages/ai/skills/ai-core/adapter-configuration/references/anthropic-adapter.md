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

| Model                | Context Window | Max Output | Notes                                       |
| -------------------- | -------------- | ---------- | ------------------------------------------- |
| `claude-fable-5-1`   | 1M             | 128K       | Newest; thinking always on (adaptive)       |
| `claude-fable-5`     | 1M             | 128K       | Most capable; thinking always on (adaptive) |
| `claude-opus-5`      | 1M             | 128K       | Opus tier; budget thinking + sampling       |
| `claude-opus-5-fast` | 1M             | 128K       | Fast-mode Opus 5; same options as opus-5    |
| `claude-sonnet-5-5`  | 1M             | 128K       | Sonnet tier; adaptive-only, no sampling     |
| `claude-haiku-5-5`   | 1M             | 128K       | Fastest; adaptive thinking, no sampling     |
| `claude-sonnet-5`    | 1M             | 128K       | Best balance; adaptive thinking by default  |
| `claude-opus-4-8`    | 1M             | 128K       | Opus tier; adaptive thinking, no sampling   |
| `claude-opus-4-7`    | 1M             | 128K       | Older Opus; adaptive thinking, no sampling  |
| `claude-opus-4-6`    | 200K           | 128K       | Older Opus, adaptive + budget thinking      |
| `claude-sonnet-4-6`  | 1M             | 64K        | Previous gen balanced, adaptive + budget    |
| `claude-sonnet-4-5`  | 200K           | 64K        | Previous gen balanced                       |
| `claude-opus-4-5`    | 200K           | 32K        | Previous gen most capable                   |
| `claude-opus-4-1`    | 200K           | 64K        | Deprecated (retires 2026-08-05)             |
| `claude-haiku-4-5`   | 200K           | 64K        | Fast and affordable                         |

Note: Model IDs use the format `claude-sonnet-5`, `claude-opus-4-8`, etc.
Retired models (Claude 3.x, Sonnet 3.7, Opus 4 / Sonnet 4) were removed —
every registered id resolves against the first-party Anthropic API.
`claude-opus-5-fast` is the only `-fast` id that remains.

Thinking is set with `chat({ reasoning })`, not `modelOptions`. The adapter
sends adaptive thinking with `output_config.effort` on Claude 4.7 and later,
adaptive thinking with a top-level `effort` on `claude-opus-4-6` /
`claude-sonnet-4-6`, and a thinking token budget on the older models.

## Provider-Specific modelOptions

```typescript
import { chat } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'

const messages = [{ role: 'user' as const, content: 'Hello' }]

chat({
  adapter: anthropicText('claude-sonnet-4-6'),
  messages,
  modelOptions: {
    // Sampling
    temperature: 0.7,
    // top_p: 0.9, // cannot be combined with temperature
    max_tokens: 16000,
    // Service tier
    service_tier: 'auto', // 'auto' | 'standard_only'
    // Stop sequences
    stop_sequences: ['END'],
    // Tool choice
    tool_choice: { type: 'auto' },
    // Context management
    context_management: {/* BetaContextManagementConfig */},
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
import { chat } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'

const messages = [{ role: 'user' as const, content: 'Hello' }]

chat({
  adapter: anthropicText('claude-sonnet-5'), // or 'claude-fable-5', 'claude-opus-4-8'
  messages,
  // Adaptive thinking with output_config.effort. 'xhigh' is a level on
  // Opus 4.7+, Sonnet 5, and Fable 5. claude-fable-5 cannot turn thinking off.
  reasoning: 'xhigh',
  modelOptions: {
    max_tokens: 64_000,
    // NO temperature / top_p / top_k — the API rejects them on these models
  },
})
```

## Gotchas

- A thinking budget (`reasoning: { level, budgetTokens }`) goes only to the
  budget models. The adapter raises `max_tokens` above the budget.
- Cannot set both `top_p` and `temperature` at the same time (throws error).
- `claude-sonnet-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-fable-5`,
  `claude-fable-5-1`, `claude-opus-4-8`, and `claude-opus-4-7` do NOT accept
  `temperature`, `top_p`, or `top_k` (typed per model). Their `reasoning`
  levels go out as adaptive thinking.
- System prompts support prompt caching via `cache_control` on `TextBlockParam[]`.
- All Claude models accept `text`, `image`, and `document` (PDF) input.
