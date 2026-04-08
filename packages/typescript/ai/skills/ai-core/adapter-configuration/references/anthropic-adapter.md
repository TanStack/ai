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

| Model               | Context Window | Max Output | Notes                           |
| ------------------- | -------------- | ---------- | ------------------------------- |
| `claude-opus-4-6`   | 200K           | 128K       | Most capable, adaptive thinking |
| `claude-sonnet-4-6` | 1M             | 64K        | Best balance, adaptive thinking |
| `claude-sonnet-4-5` | 200K           | 64K        | Previous gen balanced           |
| `claude-opus-4-5`   | 200K           | 32K        | Previous gen most capable       |
| `claude-haiku-4-5`  | 200K           | 64K        | Fast and affordable             |
| `claude-sonnet-4`   | 200K           | 64K        | Older balanced model            |
| `claude-opus-4`     | 200K           | 32K        | Older most capable              |

Note: Model IDs use the format `claude-opus-4-6`, `claude-sonnet-4-6`, etc.

## Provider-Specific modelOptions

```typescript
chat({
  adapter: anthropicText('claude-sonnet-4-6'),
  messages,
  maxTokens: 16000,
  modelOptions: {
    // Extended thinking (budget-based)
    thinking: {
      type: 'enabled',
      budget_tokens: 8000, // must be >= 1024 and < maxTokens
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

## Gotchas

- `thinking.budget_tokens` must be >= 1024 AND less than `maxTokens`.
  Failing either check throws a validation error.
- Cannot set both `top_p` and `temperature` at the same time (throws error).
- `claude-3-5-haiku` and `claude-3-haiku` do NOT support extended thinking.
- System prompts support prompt caching via `cache_control` on `TextBlockParam[]`.
- All Claude models accept `text`, `image`, and `document` (PDF) input.
