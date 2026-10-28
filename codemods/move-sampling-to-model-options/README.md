# `move-sampling-to-model-options`

Moves the root-level convenience sampling props — `temperature`, `topP`, and
`maxTokens` — off `chat()` / `ai()` / `generate()` / `createChatOptions()`
calls (imported from `@tanstack/ai`) and into the provider-native
`modelOptions` object, renaming each one to its provider's canonical option
name.

This is a **breaking change**: the root-level props have been removed, so run
this codemod to migrate existing call sites onto the new `modelOptions` shape.

## What it changes

The provider is resolved from the `adapter:` property's factory call (e.g.
`openaiText('gpt-4o')` → `openai`). Each present root prop is moved into
`modelOptions` under its provider-specific name:

| Root prop     | openai (Responses)  | anthropic     | gemini            | grok          | groq                    | openrouter            | ollama (nested)       |
| ------------- | ------------------- | ------------- | ----------------- | ------------- | ----------------------- | --------------------- | --------------------- |
| `temperature` | `temperature`       | `temperature` | `temperature`     | `temperature` | `temperature`           | `temperature`         | `options.temperature` |
| `topP`        | `top_p`             | `top_p`       | `topP`            | `top_p`       | `top_p`                 | `topP`                | `options.top_p`       |
| `maxTokens`   | `max_output_tokens` | `max_tokens`  | `maxOutputTokens` | `max_tokens`  | `max_completion_tokens` | `maxCompletionTokens` | `options.num_predict` |

The `openai` column above is the **Responses** adapter (`openaiText`), whose
`maxTokens` key is `max_output_tokens`. The **Chat Completions** adapter
(`openaiChatCompletions`) instead uses `max_tokens`, and is _not_ auto-resolved
by this codemod — those call sites are left untouched and reported, so migrate
them by hand: `temperature → temperature`, `topP → top_p`,
`maxTokens → max_tokens`.

For **ollama**, the renamed keys are nested inside a `options` object **within**
`modelOptions` (e.g. `modelOptions: { options: { temperature, num_predict } }`).

### Example (openai)

```ts
// before
chat({
  adapter: openaiText('gpt-4o'),
  messages,
  temperature: 0.3,
  maxTokens: 100,
})

// after
chat({
  adapter: openaiText('gpt-4o'),
  messages,
  modelOptions: {
    temperature: 0.3,
    max_output_tokens: 100,
  },
})
```

If `modelOptions` already exists (as an object literal), the renamed keys are
merged into it. Original value expressions are preserved; a shorthand prop
(`{ temperature }`) whose provider key is unchanged stays shorthand
(`{ temperature }`), and one whose key is renamed becomes `newKey: temperature`.

## Running it

From this repo:

```bash
pnpm codemod:move-sampling-to-model-options "src/**/*.{ts,tsx}"
```

Or directly against the published transform — no clone needed:

```bash
npx jscodeshift \
  --parser=tsx \
  -t https://raw.githubusercontent.com/TanStack/ai/main/codemods/move-sampling-to-model-options/transform.ts \
  src/**/*.{ts,tsx}
```

Add `--dry --print` to preview the rewrite without modifying files.

## Report / skip behavior

The codemod never partially transforms a single call. It leaves the call
untouched and emits an `api.report(...)` message in these cases:

- **Unresolvable adapter** — no `adapter` prop, the adapter value isn't a
  recognized provider-factory call (e.g. `makeAdapter()`), or it's
  dynamic/spread.
- **`modelOptions` is not a plain object literal** — e.g. a spread or an
  identifier reference.
- **Key conflict** — a target renamed key already exists in `modelOptions`
  (or in `modelOptions.options` for ollama). Resolve these by hand.
