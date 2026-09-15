# OpenAI Adapter Reference

## Package

```
@tanstack/ai-openai
```

## Adapter Factories

| Factory               | Type           | Description                          |
| --------------------- | -------------- | ------------------------------------ |
| `openaiText`          | Text/Chat      | Chat completions (Responses API)     |
| `openaiImage`         | Image          | Image generation (DALL-E, GPT Image) |
| `openaiSpeech`        | TTS            | Text-to-speech                       |
| `openaiTranscription` | Transcription  | Speech-to-text                       |
| `openaiVideo`         | Video          | Video generation (experimental)      |
| `openaiSummarize`     | Summarize      | Text summarization                   |
| `openaiRealtime`      | Realtime/Voice | Realtime voice conversations         |

## Import

```typescript
import { openaiText } from '@tanstack/ai-openai'
import { openaiImage } from '@tanstack/ai-openai'
import { openaiSpeech } from '@tanstack/ai-openai'
```

## Key Chat Models

| Model          | Context Window | Max Output | Notes                                          |
| -------------- | -------------- | ---------- | ---------------------------------------------- |
| `gpt-6-astra`  | 1M             | 128K       | Newest; reasoning, tools, image input          |
| `gpt-5.6`      | 1M             | 128K       | Reasoning, tools, image input                  |
| `gpt-5.5`      | 1M             | 128K       | Flagship used in examples; text/image/document |
| `gpt-5.5-pro`  | 1M             | 128K       | Higher reasoning tier                          |
| `gpt-5.4-mini` | 400K           | 128K       | Cost-efficient (no bare `gpt-5.4` chat id)     |
| `gpt-5.2`      | 400K           | 128K       | Previous flagship; text/image/document         |
| `gpt-5-mini`   | 400K           | 128K       | Budget                                         |

`OPENAI_CHAT_MODELS` is the full list (also `gpt-6-astra-pro`, the
`gpt-5.6-luna/sol/terra` family, `gpt-5.4-nano`, `gpt-5.2-pro`,
`gpt-5.1`, `gpt-5`, the `o3`/`o4-mini` reasoning models, and `gpt-4.1`/`gpt-4o`).

## Provider-Specific modelOptions

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const messages = [{ role: 'user' as const, content: 'Hello' }]

chat({
  adapter: openaiText('gpt-5.5'),
  messages,
  modelOptions: {
    // Sampling
    temperature: 0.7,
    top_p: 0.9,
    max_output_tokens: 1000,
    // Reasoning (effort levels: none, minimal, low, medium, high)
    reasoning: {
      effort: 'high',
      summary: 'auto', // 'auto' | 'detailed'
    },
    // Service tier
    service_tier: 'auto', // 'auto' | 'default' | 'flex' | 'priority'
    // Response storage
    store: true,
    // Truncation strategy
    truncation: 'auto', // 'auto' | 'disabled'
    // Tool calling
    max_tool_calls: 10,
    parallel_tool_calls: true,
    tool_choice: 'auto', // 'auto' | 'none' | 'required'
    // Structured output
    text: {/* ResponseTextConfig */},
    // Metadata (max 16 key-value pairs)
    metadata: { session_id: 'abc' },
    // Streaming
    stream_options: { include_obfuscation: true },
    // Verbosity
    verbosity: 'medium', // 'low' | 'medium' | 'high'
    // Prompt caching
    prompt_cache_key: 'my-cache',
    prompt_cache_retention: '24h',
    // Conversations API
    conversation: { id: 'conv-123' },
    // Background processing
    background: false,
  },
})
```

## Environment Variable

```
OPENAI_API_KEY
```

## Gotchas

- Uses the **Responses API** (not Chat Completions) by default.
- `gpt-5.1` defaults reasoning effort to `none`; you must explicitly set
  `effort: 'low'` or higher to enable reasoning.
- `o3-pro` only supports `high` reasoning effort.
- `conversation` and `previous_response_id` cannot be used together.
- Reasoning models (`o*`, `gpt-5*` except `*-chat-latest`, `codex-mini-latest`)
  pair each `function_call` with a `reasoning` item. The adapter requests
  `include: ['reasoning.encrypted_content']` for those models and replays that
  item on the next turn. Pre-5 chat models are left unchanged. If you persist
  history by hand, keep `thinking[].signature`.
