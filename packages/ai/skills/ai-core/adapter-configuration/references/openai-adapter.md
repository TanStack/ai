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

| Model                 | Context Window | Max Output | Notes                                  |
| --------------------- | -------------- | ---------- | -------------------------------------- |
| `gpt-5.4`             | 400K           | 128K       | Flagship, reasoning, image input       |
| `gpt-5.4-pro`         | 400K           | 128K       | Higher reasoning, no structured output |
| `gpt-5.4-chat-latest` | 128K           | 16K        | Chat-optimized variant                 |
| `gpt-5.1`             | 400K           | 128K       | Previous flagship, image I/O           |
| `gpt-5`               | 400K           | 128K       | Previous gen flagship                  |
| `gpt-5-mini`          | 400K           | 128K       | Cost-efficient                         |

## Provider-Specific modelOptions

```typescript
chat({
  adapter: openaiText('gpt-5.4'),
  messages,
  modelOptions: {
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
    text: {
      /* ResponseTextConfig */
    },
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
