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

| Model                         | Context Window | Notes                        |
| ----------------------------- | -------------- | ---------------------------- |
| `grok-4-1-fast-reasoning`     | 2M             | Latest, fast reasoning       |
| `grok-4-1-fast-non-reasoning` | 2M             | Latest, no reasoning         |
| `grok-code-fast-1`            | 256K           | Code-specialized, reasoning  |
| `grok-4`                      | 256K           | Full reasoning, tool calling |
| `grok-4-fast-reasoning`       | 2M             | Fast reasoning variant       |
| `grok-3`                      | 131K           | Previous gen, no reasoning   |
| `grok-3-mini`                 | 131K           | Budget reasoning             |
| `grok-2-vision-1212`          | 32K            | Vision input                 |

Image model: `grok-2-image-1212`

## Provider-Specific modelOptions

Grok uses an OpenAI-compatible API. Options are straightforward:

```typescript
chat({
  adapter: grokText('grok-4'),
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
- `grok-4-1-fast-non-reasoning` and `grok-4-fast-non-reasoning` explicitly
  do NOT support reasoning. Other grok-4+ models do.
- `grok-2-vision-1212` is the only model with image input support in the
  older generation.
- The grok-4-1 fast models have a massive 2M context window.
- Provider options are simpler than OpenAI's (no Responses API features,
  no structured outputs config, no metadata).
