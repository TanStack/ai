---
title: Moving Sampling Options into modelOptions
---

# Moving Sampling Options into `modelOptions`

> **TL;DR:** This is a **breaking change**. The root-level convenience sampling props on `chat()` / `ai()` / `generate()` — `temperature`, `topP`, and `maxTokens` — have been **removed** and now live inside provider-native `modelOptions` instead. Passing them at the root no longer type-checks and has no effect at runtime. Move each one into `modelOptions` under its provider's canonical name (e.g. OpenAI's `max_output_tokens`, Anthropic's `max_tokens`, Gemini's `maxOutputTokens`, Ollama's nested `options.num_predict`). A provider-aware codemod does the rewrite for you. `metadata` is unaffected and stays at the root.

## What changed

Previously, `chat()` accepted three generic sampling props directly at the root of its options:

```typescript
chat({
  adapter: openaiText('gpt-4o'),
  messages,
  temperature: 0.3,
  topP: 0.9,
  maxTokens: 100,
})
```

These were a convenience layer that the runtime mapped onto whatever the underlying provider expected. That generic mapping is now gone. Sampling parameters live where every other model-specific knob already lives — inside the provider-native `modelOptions` object — under each provider's own canonical key name.

```typescript
chat({
  adapter: openaiText('gpt-4o'),
  messages,
  modelOptions: {
    temperature: 0.3,
    top_p: 0.9,
    max_output_tokens: 100,
  },
})
```

## Why it changed

- **Provider-native, single source of truth.** Every provider names these parameters differently — OpenAI's Responses API wants `max_output_tokens`, Anthropic wants `max_tokens`, Gemini wants `maxOutputTokens`, Ollama nests them under `options`. A single generic `maxTokens` prop had to guess the target per provider. Putting them in `modelOptions` means there is exactly one place sampling lives, and it matches the provider's own API surface.
- **Typed.** `modelOptions` is already typed per adapter+model, so moving sampling there gives you autocomplete and compile-time checking for the exact keys a given model accepts — instead of three loosely-typed root props.
- **No generic mapping.** Reasoning models in particular do not treat these parameters uniformly (some ignore `temperature`, some reject `max_tokens` below the thinking budget, etc.). A generic root-level mapping papered over those differences; provider-native `modelOptions` lets each adapter handle them honestly.

## Before / after by provider

The root prop names are the same everywhere (`temperature`, `topP`, `maxTokens`). The `modelOptions` target key differs per provider — use the exact key your provider expects.

### OpenAI

```typescript
// Before
chat({
  adapter: openaiText('gpt-4o'),
  messages,
  temperature: 0.3,
  topP: 0.9,
  maxTokens: 100,
})

// After
chat({
  adapter: openaiText('gpt-4o'),
  messages,
  modelOptions: {
    temperature: 0.3,
    top_p: 0.9,
    max_output_tokens: 100,
  },
})
```

### Anthropic

```typescript
// Before
chat({
  adapter: anthropicText('claude-sonnet-4-5'),
  messages,
  temperature: 0.3,
  topP: 0.9,
  maxTokens: 1024,
})

// After
chat({
  adapter: anthropicText('claude-sonnet-4-5'),
  messages,
  modelOptions: {
    temperature: 0.3,
    top_p: 0.9,
    max_tokens: 1024,
  },
})
```

### Gemini

```typescript
// Before
chat({
  adapter: geminiText('gemini-3.1-pro-preview'),
  messages,
  temperature: 0.3,
  topP: 0.9,
  maxTokens: 2048,
})

// After
chat({
  adapter: geminiText('gemini-3.1-pro-preview'),
  messages,
  modelOptions: {
    temperature: 0.3,
    topP: 0.9,
    maxOutputTokens: 2048,
  },
})
```

### Ollama (nested under `options`)

Ollama is the one provider where sampling parameters are **nested** inside an `options` object within `modelOptions`, and the token limit is named `num_predict`:

```typescript
// Before
chat({
  adapter: ollamaText('llama3'),
  messages,
  temperature: 0.3,
  topP: 0.9,
  maxTokens: 1000,
})

// After
chat({
  adapter: ollamaText('llama3'),
  messages,
  modelOptions: {
    options: {
      temperature: 0.3,
      top_p: 0.9,
      num_predict: 1000,
    },
  },
})
```

## Provider key reference

| Root prop     | OpenAI              | Anthropic    | Gemini            | Grok         | Groq                    | OpenRouter            | Ollama (nested under `options`) |
| ------------- | ------------------- | ------------ | ----------------- | ------------ | ----------------------- | --------------------- | ------------------------------- |
| `temperature` | `temperature`       | `temperature`| `temperature`     | `temperature`| `temperature`           | `temperature`         | `options.temperature`           |
| `topP`        | `top_p`             | `top_p`      | `topP`            | `top_p`      | `top_p`                 | `topP`                | `options.top_p`                 |
| `maxTokens`   | `max_output_tokens` | `max_tokens` | `maxOutputTokens` | `max_tokens` | `max_completion_tokens` | `maxCompletionTokens` | `options.num_predict`           |

## Automated codemod

A jscodeshift codemod moves the root sampling props into `modelOptions` for you, renaming each one to the correct provider-native key. It resolves the provider from the `adapter:` factory call (e.g. `openaiText('gpt-4o')` → OpenAI), so the rewrite is provider-aware. Run it from the repo:

```bash
pnpm codemod:move-sampling-to-model-options "src/**/*.{ts,tsx}"
```

Or run the published transform directly — no clone needed:

```bash
npx jscodeshift \
  --parser=tsx \
  -t https://raw.githubusercontent.com/TanStack/ai/main/codemods/move-sampling-to-model-options/transform.ts \
  "src/**/*.{ts,tsx}"
```

Add `--dry --print` to preview the rewrite without modifying files.

**What it does:**

- Targets `chat()`, `ai()`, `generate()`, and `createChatOptions()` calls imported from `@tanstack/ai`.
- Resolves the provider from the `adapter:` factory call and renames each present root prop to that provider's canonical key.
- For Ollama, nests the renamed keys inside `modelOptions.options`.
- Merges into an existing `modelOptions` object literal when present; preserves the original value expressions and expands shorthand props (`{ temperature }` → `temperature: temperature`).

**Report + skip (never partial):** the codemod never partially transforms a call. It leaves the call untouched and emits an `api.report(...)` message when it can't safely proceed:

- **Unresolvable adapter** — no `adapter` prop, the adapter isn't a recognized provider-factory call (e.g. `makeAdapter()`), or it's dynamic/spread.
- **`modelOptions` is not a plain object literal** — e.g. a spread or an identifier reference.
- **Key conflict** — a target renamed key already exists in `modelOptions` (or in `modelOptions.options` for Ollama). Resolve these by hand.

See [`codemods/move-sampling-to-model-options/README.md`](https://github.com/TanStack/ai/blob/main/codemods/move-sampling-to-model-options/README.md) for the full transform details and limitations.

## What stays at the root

`metadata` is **not** a sampling parameter and is unaffected — it stays at the root of `chat()`:

```typescript
chat({
  adapter: openaiText('gpt-4o'),
  messages,
  metadata: { requestId: 'abc-123' }, // ← still at the root
  modelOptions: {
    temperature: 0.3,
    max_output_tokens: 100,
  },
})
```

## Need Help?

- [Per-Model Type Safety](../advanced/per-model-type-safety) — how the adapter+model pair drives `modelOptions` inference.
- [API Reference](../api/ai) — complete `chat()` signature.
- See your provider's adapter page ([OpenAI](../adapters/openai), [Anthropic](../adapters/anthropic), [Gemini](../adapters/gemini), [Ollama](../adapters/ollama)) for the full list of `modelOptions` it accepts.
</content>
</invoke>
