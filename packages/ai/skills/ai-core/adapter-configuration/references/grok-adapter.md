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

| Model            | Context Window | Notes                                                    |
| ---------------- | -------------- | -------------------------------------------------------- |
| `grok-4.6`       | 500K           | Latest; reasoning, tools, structured output; document in |
| `grok-4.5`       | 500K           | Reasoning, tools, structured output; document in         |
| `grok-4.3`       | 1M             | Reasoning, tools, structured output; text + image in     |
| `grok-build-0.1` | 256K           | Code-specialized; `reasoning` option is not accepted     |

`GROK_CHAT_MODELS` is exactly these four ids. Image models
(`GROK_IMAGE_MODELS`): `grok-2-image-1212`, `grok-imagine-image`,
`grok-imagine-image-2.0`, `grok-imagine-image-quality`.

## Provider-Specific modelOptions

Grok speaks the OpenAI **Responses** API (the adapter uses the OpenAI SDK
against `https://api.x.ai/v1`), so option names follow that API:

```typescript
import { chat } from '@tanstack/ai'
import { grokText } from '@tanstack/ai-grok'

const messages = [{ role: 'user' as const, content: 'Hello' }]

chat({
  adapter: grokText('grok-4.6'),
  messages,
  modelOptions: {
    // Sampling (Responses API names)
    temperature: 0.7,
    top_p: 0.9,
    max_output_tokens: 4096,
    // Reasoning (reasoning-capable models)
    reasoning: { effort: 'high' }, // 'none' | 'low' | 'medium' | 'high'
    // Response storage (adapter default: false)
    store: false,
    // End-user id for abuse monitoring
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
- All four chat models support reasoning; `grok-build-0.1` is the exception
  in that it rejects the `reasoning` option (`GrokBuildProviderOptions`).
- `grok-4.5` / `grok-4.6` accept `text`, `image`, and `document` input;
  `grok-4.3` / `grok-build-0.1` accept `text` and `image`.
- Provider options are a subset of OpenAI's Responses options:
  `temperature`, `top_p`, `max_output_tokens`, `reasoning`, `store`,
  `include`, `user`. There is no `max_tokens`, `frequency_penalty`,
  `presence_penalty`, `stop`, or `metadata`.
