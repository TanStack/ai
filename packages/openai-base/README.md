# @tanstack/openai-base

Shared base adapters for providers that drive the official `openai` SDK
against a different `baseURL`.

## TL;DR

Several providers ship endpoints that the official `openai` Node SDK can
talk to verbatim — you just point it at a different `baseURL`. xAI's Grok
endpoint, Groq's `/openai/v1` endpoint, and OpenAI itself all fall in this
camp. This package contains the shared logic for both wire formats those
endpoints expose:

- `OpenAIBaseChatCompletionsTextAdapter` — for `/v1/chat/completions`
- `OpenAIBaseResponsesTextAdapter` — for `/v1/responses`

Provider packages (`@tanstack/ai-openai`, `@tanstack/ai-groq`,
`@tanstack/ai-grok`) construct an `OpenAI` client with their own `baseURL`,
pass it to the relevant base adapter, and override a small set of
protected hooks for SDK-shape variance and provider-specific quirks.

## Why this package exists

Every text adapter in TanStack AI — regardless of provider — emits
[AG-UI](https://github.com/CopilotKit/ag-ui) events (`RUN_STARTED`,
`TEXT_MESSAGE_*`, `TOOL_CALL_*`, `RUN_FINISHED`, …) as its output stream.
That is the universal unification.

Input protocols differ. The OpenAI Chat Completions and Responses wire
formats both have multiple implementers in the ecosystem, so it pays to
write the streaming-chunk assembly, partial-JSON tool-arg buffering,
tool-call deduplication, and structured-output coercion once and share
it. That shared code lives here.

Providers whose native API doesn't match either OpenAI wire format
(Anthropic, Gemini, Ollama's native API, OpenRouter's own SDK) extend
`BaseTextAdapter` from `@tanstack/ai` directly — there's nothing to
share, so they don't pay the indirection cost.

## What goes here vs. in `@tanstack/ai-openai`

| Belongs in `@tanstack/openai-base`                                                                  | Belongs in `@tanstack/ai-openai`                                                                                              |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Logic for the Chat Completions wire format                                                          | OpenAI-specific tool types (`web_search_preview`, `code_interpreter`, `local_shell`, `apply_patch`, `computer_use`, `mcp`, …) |
| Logic for the Responses wire format                                                                 | OpenAI model metadata, model lists, capability matrices                                                                       |
| Streaming chunk assembly, AG-UI lifecycle, partial-JSON tool-arg buffering, tool-call deduplication | OpenAI-only request/response fields that no other consumer of the base sets                                                   |
| Schema converters and structured-output coercion that all consumers accept                          | OpenAI's media adapters (image/TTS/video/transcription) that Grok/Groq don't implement                                        |

**Rule of thumb**: if a field would be useful to at least two of the
consuming packages (`ai-openai`, `ai-grok`, `ai-groq`), it belongs here.
Otherwise it belongs in the provider's own package, plumbed in via a
subclass override or a hook.

## How providers extend the bases

The base constructor takes a pre-built `OpenAI` client. Subclasses
construct the SDK with their own `baseURL` (and any other client
options) and pass it to `super`:

```ts
class GrokTextAdapter extends OpenAIBaseChatCompletionsTextAdapter<…> {
  constructor(config: GrokConfig, model: TModel) {
    super(model, 'grok', new OpenAI(withGrokDefaults(config)))
  }
}
```

Per-provider quirks are handled via protected hooks:

- `convertMessage`, `mapOptionsToRequest` — bridge request-shape
  differences (extra fields, omitted fields, alternative encodings).
- `extractReasoning` — surface a provider's reasoning channel into the
  shared `REASONING_*` AG-UI lifecycle.
- `transformStructuredOutput`, `makeStructuredOutputCompatible` —
  adjust structured-output handling for provider quirks (e.g. Groq's
  schema-shape requirements).
- `processStreamChunks` — wrap the shared chunk processor for last-mile
  fixups (e.g. Groq's `x_groq.usage` → `chunk.usage` promotion).
- `extractTextFromResponse` — pull the assistant text out of the
  provider's non-streaming response shape.

Each provider typically overrides 2–6 hooks and inherits everything else.

## Architecture

```
@tanstack/ai
└── BaseTextAdapter  (abstract — emits AG-UI events)
    │
    ├── @tanstack/openai-base::OpenAIBaseChatCompletionsTextAdapter
    │   ├── ai-groq
    │   └── ai-grok
    │
    ├── @tanstack/openai-base::OpenAIBaseResponsesTextAdapter
    │   └── ai-openai (Responses is OpenAI's preferred API)
    │
    ├── ai-anthropic::AnthropicTextAdapter   extends BaseTextAdapter directly
    ├── ai-gemini::GeminiTextAdapter         extends BaseTextAdapter directly
    ├── ai-ollama::OllamaTextAdapter         extends BaseTextAdapter directly
    └── ai-openrouter (text + responses)     extends BaseTextAdapter directly
                                              (uses @openrouter/sdk natively)
```

Note: `ai-openai` ships only the Responses-based text adapter. For pure
Chat Completions use cases without OpenAI-specific behaviour, use
`ai-grok` or `ai-groq`, or build a new provider package extending
`OpenAIBaseChatCompletionsTextAdapter`.

## Direct use

Most users don't import from this package directly; they install a
provider package and the adapter from there does the work.

If you're building an adapter for a new endpoint that the official
`openai` SDK can talk to verbatim (vLLM, Together, Fireworks, a
self-hosted gateway, …), import the abstract adapters from this package
and subclass them. The existing providers are worked examples —
`@tanstack/ai-grok` is the simplest (xAI's API is a near-direct OpenAI
Chat Completions clone), `@tanstack/ai-groq` shows the
`processStreamChunks` and `makeStructuredOutputCompatible` override
pattern.
