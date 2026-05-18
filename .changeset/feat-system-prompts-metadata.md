---
'@tanstack/ai': minor
'@tanstack/ai-anthropic': minor
'@tanstack/ai-event-client': patch
'@tanstack/ai-gemini': patch
'@tanstack/ai-ollama': patch
'@tanstack/ai-openai': patch
'@tanstack/ai-openrouter': patch
'@tanstack/openai-base': patch
---

feat(ai): `systemPrompts` accept `{ content, metadata }` with adapter-inferred metadata typing

`chat({ systemPrompts })` now accepts either a plain string (the existing
shape — fully backward compatible) or `{ content, metadata }`. The `metadata`
field's type is inferred from the adapter via a new
`TSystemPromptMetadata` generic on `TextAdapter` / `BaseTextAdapter`:

- `@tanstack/ai-anthropic` declares `AnthropicSystemPromptMetadata` →
  users get `cache_control` autocomplete and type-checking on
  `systemPrompts[i].metadata` for Anthropic chats.
- Adapters with no per-prompt metadata (OpenAI, Gemini, Ollama,
  OpenRouter, openai-base) inherit the default `never`, which makes the
  `metadata` field unusable at the call site — passing it is a TypeScript
  error.

```ts
import { chat } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'

// Anthropic — `cache_control` is autocompleted, no `satisfies` needed.
chat({
  adapter: anthropicText({ apiKey }, 'claude-sonnet-4-6'),
  systemPrompts: [
    {
      content: 'Stable instructions — cache me.',
      metadata: { cache_control: { type: 'ephemeral' } },
    },
    'Volatile per-request instruction.',
  ],
})

// OpenAI — `metadata` field is `never`, attempting to pass it errors at compile time.
chat({
  adapter: openaiText({ apiKey }, 'gpt-4o-mini'),
  systemPrompts: [
    'Plain string.',
    { content: 'Object form without metadata is allowed.' },
  ],
})
```

New exports:

- `@tanstack/ai`: `SystemPrompt`, `NormalizedSystemPrompt` types and the
  `normalizeSystemPrompts()` helper adapters use to normalize the wide
  input shape to `{ content, metadata? }` before consumption.
- `@tanstack/ai-anthropic`: `AnthropicSystemPromptMetadata` interface
  (currently exposes `cache_control` for prompt caching).

Internal:

- New `TSystemPromptMetadata = never` generic on `TextAdapter` /
  `BaseTextAdapter`, surfaced via `'~types'['systemPromptMetadata']`
  for inference at the `chat()` call site.
- Anthropic adapter reads `metadata.cache_control` and attaches it to
  the corresponding `TextBlockParam`.
- All other text adapters call `normalizeSystemPrompts()` and join
  `.content` for their respective `instructions` / `system` /
  `systemInstruction` fields.
- `@tanstack/ai-event-client` mirrors the `SystemPrompt` shape locally
  (avoids a circular import) and projects metadata away on the devtools
  wire — devtools UI still receives `Array<string>`.
