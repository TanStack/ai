# Grok (xAI) Adapter Reference

## Package

```
@tanstack/ai-grok
```

## Adapter Factories

| Factory         | Type      | Description        |
| --------------- | --------- | ------------------ |
| `grokText`      | Text/Chat | Chat completions   |
| `grokImage`     | Image     | Image generation   |
| `grokSummarize` | Summarize | Text summarization |

## Import

```typescript
import { grokText } from '@tanstack/ai-grok'
import { grokImage } from '@tanstack/ai-grok'
```

## Key Chat Models

| Model                    | Context Window | Notes                        |
| ------------------------ | -------------- | ---------------------------- |
| `grok-4.3`               | 2M             | Latest reasoning model       |
| `grok-4.2`               | 2M             | Reasoning model              |
| `grok-4-2-non-reasoning` | 2M             | Non-reasoning model          |

Image model: `grok-imagine-image`

## Provider-Specific modelOptions

Grok uses an OpenAI-compatible API. Options are straightforward:

```typescript
chat({
  adapter: grokText('grok-4.3'),
  messages,
  modelOptions: {
    temperature: 0.7,
    max_tokens: 4096,
    top_p: 0.9,
    frequency_penalty: 0.5,
    presence_penalty: 0.5,
    stop: ['\n\n'],
    user: 'user-123',
  },
})
```

## Environment Variable

```
XAI_API_KEY
```

**Important:** The env var is `XAI_API_KEY`, not `GROK_API_KEY`.
The adapter uses the OpenAI SDK with xAI's base URL (`https://api.x.ai/v1`).

## Gotchas

- Uses the OpenAI SDK under the hood with a custom `baseURL`.
- `grok-4-2-non-reasoning` explicitly does NOT support reasoning.
- Current chat models support text and image input.
- The Grok 4.2/4.3 models have a 2M context window.
- Provider options are simpler than OpenAI's (no Responses API features,
  no structured outputs config, no metadata).
