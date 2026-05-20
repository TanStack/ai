---
id: SystemPrompt
title: SystemPrompt
---

# Type Alias: SystemPrompt\<TMetadata\>

```ts
type SystemPrompt<TMetadata> = 
  | string
  | {
  content: string;
  metadata?: TMetadata;
};
```

Defined in: [packages/typescript/ai/src/system-prompts.ts:39](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/system-prompts.ts#L39)

A single entry in `chat({ systemPrompts: [...] })`.

Accepts a plain string (the common case) or a structured object that lets
providers attach typed metadata to the prompt — e.g. Anthropic
`cache_control` for prompt caching, future per-prompt safety overrides for
Gemini, etc.

At the chat call site, `metadata` is narrowed by the adapter via
`~types['systemPromptMetadata']`. Providers that don't declare one inherit
the default `never`, which makes the field carry no meaningful value: TS
only accepts `undefined` there, and provider-foreign metadata that reaches
an adapter via JS / `as any` is silently dropped, never written to the
wire. For type-safe per-provider metadata, refer to the provider's
`<Provider>SystemPromptMetadata` interface (e.g. `AnthropicSystemPromptMetadata`).

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

## Examples

```ts
// The 90% case — plain strings work everywhere.
  systemPrompts: ['Be concise.', 'Cite sources.']
```

```ts
// Provider-specific metadata via the object form. No `satisfies` cast
  // is needed — the adapter narrows the `metadata` field's type at the
  // call site so users get autocomplete and structural checking
  // automatically.
  import { anthropicText } from '@tanstack/ai-anthropic'

  chat({
    adapter: anthropicText(),
    systemPrompts: [
      {
        content: 'Stable instructions — cache me.',
        metadata: { cache_control: { type: 'ephemeral' } },
      },
      'Volatile per-request instruction.',
    ],
  })
```
