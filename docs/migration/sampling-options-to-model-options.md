---
title: Moving Sampling Options into modelOptions
description: "Move temperature, topP, and maxTokens from the root of chat() into modelOptions, with the key name of each provider. A codemod does most of the work."
---

Your `chat()` call has `temperature`, `topP`, or `maxTokens` at the root, and it does not type-check. These three options moved into `modelOptions`, under the key name of each provider. At the root, they also do nothing at runtime.

A codemod moves them for you. `metadata` is not a sampling option, so it stays at the root.

```diff
  chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
-   temperature: 0.3,
-   topP: 0.9,
-   maxTokens: 100,
+   modelOptions: {
+     temperature: 0.3,
+     top_p: 0.9,
+     max_output_tokens: 100,
+   },
  })
```

## Run the codemod

1. Run the codemod on your source files:

   ```bash
   npx jscodeshift \
     --parser=tsx \
     -t https://raw.githubusercontent.com/TanStack/ai/main/codemods/move-sampling-to-model-options/transform.ts \
     "src/**/*.{ts,tsx}"
   ```

   To see the changes before the codemod writes them, add `--dry --print`.

2. Read the report lines in the output. Each line is a call that the codemod did not change. Move those options by hand with the [key table](#provider-key-reference).
3. If you use Grok, change `max_tokens` to `max_output_tokens` in each Grok `modelOptions`. The codemod writes `max_tokens` for Grok, but the Grok adapter reads `max_output_tokens`.
4. Run your type checker.

## Provider key reference

The root names were the same for every provider. The key in `modelOptions` is different for each provider:

| Root option | OpenAI | Anthropic | Gemini | Grok | Groq | OpenRouter | Ollama (in `options`) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `temperature` | `temperature` | `temperature` | `temperature` | `temperature` | `temperature` | `temperature` | `options.temperature` |
| `topP` | `top_p` | `top_p` | `topP` | `top_p` | `top_p` | `topP` | `options.top_p` |
| `maxTokens` | `max_output_tokens` | `max_tokens` | `maxOutputTokens` | `max_output_tokens` | `max_completion_tokens` | `maxCompletionTokens` | `options.num_predict` |

## Before and after

Every provider starts from the same root options:

```typescript ignore
// Before
chat({
  adapter: anthropicText('claude-sonnet-4-5'),
  messages,
  temperature: 0.3,
  topP: 0.9,
  maxTokens: 1024,
})
```

### OpenAI

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const messages = [{ role: 'user' as const, content: 'Hello' }]

chat({
  adapter: openaiText('gpt-6.1-sol'),
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
import { chat } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'

const messages = [{ role: 'user' as const, content: 'Hello' }]

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
import { chat } from '@tanstack/ai'
import { geminiText } from '@tanstack/ai-gemini'

const messages = [{ role: 'user' as const, content: 'Hello' }]

chat({
  adapter: geminiText('gemini-3.8-flash'),
  messages,
  modelOptions: {
    temperature: 0.3,
    topP: 0.9,
    maxOutputTokens: 2048,
  },
})
```

### Ollama

Ollama is the one provider that puts the sampling options in an `options` object inside `modelOptions`. The token limit is `num_predict`:

```typescript ignore
import { chat } from '@tanstack/ai'
import { ollamaText } from '@tanstack/ai-ollama'

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

### `metadata` stays at the root

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const messages = [{ role: 'user' as const, content: 'Hello' }]

chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages,
  metadata: { requestId: 'abc-123' },
  modelOptions: {
    temperature: 0.3,
    max_output_tokens: 100,
  },
})
```

## Done

Your type checker passes, and no `chat()` call has `temperature`, `topP`, or `maxTokens` at the root. For the full list of keys that each provider accepts, see its adapter page: [OpenAI](../adapters/openai), [Anthropic](../adapters/anthropic), [Gemini](../adapters/gemini), or [Ollama](../adapters/ollama).

## Advanced

### Why the options moved

- **Each provider has its own names.** OpenAI Responses uses `max_output_tokens`, Anthropic uses `max_tokens`, Gemini uses `maxOutputTokens`, and Ollama puts them in `options`. One root `maxTokens` had to guess the target for each provider. Now sampling has one place, and it uses the names of the provider API.
- **The keys are typed.** `modelOptions` is typed for each adapter and model. You get autocomplete and type errors for the exact keys that your model accepts.
- **Reasoning models differ.** Some reasoning models ignore `temperature`, and some reject `max_tokens` below the thinking budget. A root mapping hid these differences. In `modelOptions`, each adapter handles them for its provider.

How the adapter and model pick the `modelOptions` type: see [Per-Model Type Safety](../advanced/per-model-type-safety).

### What the codemod does

- It changes `chat()`, `ai()`, `generate()`, and `createChatOptions()` calls that are imported from `@tanstack/ai`. In 1.0, `@tanstack/ai` exports only `chat()` and `createChatOptions()` of these.
- It finds the provider from the `adapter:` factory call (for example, `openaiText('gpt-6.1-sol')` is OpenAI). Then it renames each root option to the key of that provider.
- For Ollama, it puts the renamed keys in `modelOptions.options`.
- If a `modelOptions` object literal exists, it adds the keys to that object. It keeps the original value expressions. It expands shorthand props (`{ temperature }` becomes `temperature: temperature`).

The codemod never changes part of a call. In these cases, it leaves the call as it is and writes an `api.report(...)` line:

- **It cannot find the adapter.** One of these is true:
  - The call has no `adapter` prop.
  - The adapter is not a known provider factory call (for example `makeAdapter()`).
  - The adapter is dynamic or a spread.
- **`modelOptions` is not a plain object literal.** For example, a spread or an identifier.
- **A key conflict.** A renamed key already exists in `modelOptions` (or in `modelOptions.options` for Ollama). Merge these by hand.

If you have a clone of the TanStack AI repo, you can also run the codemod from the repo root:

```bash
pnpm codemod:move-sampling-to-model-options "src/**/*.{ts,tsx}"
```

For the full transform details and limits, see [`codemods/move-sampling-to-model-options/README.md`](https://github.com/TanStack/ai/blob/main/codemods/move-sampling-to-model-options/README.md).
