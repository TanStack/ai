# @tanstack/ai-openai-compatible

Shared adapters for providers that implement OpenAI's wire-format protocols.

> Renamed from `@tanstack/openai-base` in 0.3.0. The "base" name was misleading.
> See [Why this package exists](#why-this-package-exists).

## TL;DR

OpenAI authored two wire formats — `/v1/chat/completions` and `/v1/responses` —
that other vendors have implemented to varying degrees. This package contains
the shared logic for talking to **any** server that speaks one of those wire
formats. OpenAI is one such server. OpenRouter, Groq, Grok, vLLM, SGLang,
Together, Ollama's compat layer, Fireworks, and others are too.

The package holds two shared base classes:

- `OpenAICompatibleChatCompletionsTextAdapter`
- `OpenAICompatibleResponsesTextAdapter`

Provider packages (`@tanstack/ai-openai`, `@tanstack/ai-openrouter`,
`@tanstack/ai-groq`, `@tanstack/ai-grok`) subclass these and override a small
set of protected hooks for SDK-shape variance.

## Why this package exists

The old name, `@tanstack/openai-base`, implied that OpenAI's evolving API
_was_ the contract — that everyone else inherits from OpenAI. That framing
broke down in two ways:

1. **OpenAI doesn't define the protocol; the ecosystem does.** Many providers
   ship `/v1/chat/completions` as their native API (Groq, Together, vLLM,
   SGLang, Fireworks, Ollama's compat layer). When OpenAI ships a new field
   that no other provider supports, that field belongs to _OpenAI's product_,
   not to the protocol.
2. **The Responses API has the same shape.** OpenRouter's beta Responses
   endpoint routes requests with OpenAI's Responses wire format to Claude,
   Gemini, and other underlying models. So Responses is also a multi-vendor
   protocol, not an OpenAI-only product surface.

Calling the protocol "OpenAI-compatible" matches the actual industry term —
Vercel publishes `@ai-sdk/openai-compatible`, BentoML and Lightning AI docs
use the same phrase, LiteLLM calls them "OpenAI-compatible endpoints." There
is no neutral standard name; the protocol is named after the vendor who
originally shipped it.

## What goes here vs. in `@tanstack/ai-openai`

| Belongs in `@tanstack/ai-openai-compatible`                                                         | Belongs in `@tanstack/ai-openai`                                                                                              |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Logic for the Chat Completions wire format                                                          | OpenAI-specific tool types (`web_search_preview`, `code_interpreter`, `local_shell`, `apply_patch`, `computer_use`, `mcp`, …) |
| Logic for the Responses wire format                                                                 | OpenAI model metadata, model lists, capability matrices                                                                       |
| Streaming chunk assembly, AG-UI lifecycle, partial-JSON tool-arg buffering, tool-call deduplication | OpenAI-only request/response fields that no other vendor supports                                                             |
| Schema converters and structured-output coercion that all OpenAI-compatible servers accept          | OpenAI's media adapters (image/TTS/video/transcription) that other providers don't implement                                  |

**Rule of thumb**: if you'd add a field here, it should be supported by at
least two OpenAI-compatible providers. Otherwise it belongs in the
provider's own package, plumbed in via a subclass override or a hook.

## How providers extend the bases

Subclasses customize SDK-shape variance via a small set of protected hook
methods:

- `callChatCompletion`, `callChatCompletionStream` — substitute a different
  SDK or HTTP client (OpenRouter uses `@openrouter/sdk` here; OpenAI and
  Groq use the OpenAI SDK with a `baseURL` override).
- `convertMessage`, `mapOptionsToRequest` — bridge request-shape differences
  (camelCase vs snake_case, additional provider fields).
- `extractReasoning` — surface a provider's reasoning channel into the
  shared `REASONING_*` lifecycle.
- `transformStructuredOutput`, `makeStructuredOutputCompatible` —
  adjust structured-output handling for provider quirks.
- `processStreamChunks` — wrap the shared chunk processor for last-mile
  fixups (e.g. Groq's `x_groq.usage` → `chunk.usage`).

Each provider typically overrides 2–6 hooks and inherits everything else.

## Architecture context

Every text adapter in TanStack AI — regardless of provider — emits
[AG-UI](https://github.com/CopilotKit/ag-ui) events (`RUN_STARTED`,
`TEXT_MESSAGE_*`, `TOOL_CALL_*`, `RUN_FINISHED`, …) as its output stream.
That is the _universal_ unification.

Input protocols are different. The OpenAI-compatible family (this package)
has many implementers and warrants shared classes. Anthropic, Google Gemini,
and Ollama have single-provider input protocols, so their adapters extend
`BaseTextAdapter` from `@tanstack/ai` directly — no compatible family exists
because no compatible family exists.

```
@tanstack/ai
└── BaseTextAdapter  (abstract — emits AG-UI events)
    │
    ├── @tanstack/ai-openai-compatible::OpenAICompatibleChatCompletionsTextAdapter
    │   ├── ai-openrouter
    │   ├── ai-groq
    │   └── ai-grok
    │
    ├── @tanstack/ai-openai-compatible::OpenAICompatibleResponsesTextAdapter
    │   ├── ai-openai (primary text adapter — Responses is OpenAI's preferred API)
    │   └── ai-openrouter (beta — routes to any underlying model)
    │
    ├── ai-anthropic::AnthropicTextAdapter   extends BaseTextAdapter directly
    ├── ai-gemini::GeminiTextAdapter         extends BaseTextAdapter directly
    └── ai-ollama::OllamaTextAdapter         extends BaseTextAdapter directly
```

Note: `ai-openai` ships only the Responses-based adapter. For pure Chat
Completions use cases without OpenAI-specific behaviour, use `ai-grok`
(xAI's API is a direct OpenAI Chat Completions clone) or build a new
provider package extending `OpenAICompatibleChatCompletionsTextAdapter`.

## Direct use

Most users don't import from this package directly; they install a provider
package and the adapter from there does the work.

If you're building an adapter for a new OpenAI-compatible provider (vLLM,
Together, Fireworks, a self-hosted gateway, …), import the abstract
adapters from this package and subclass them. The existing providers are
worked examples — `@tanstack/ai-grok` is the simplest (xAI's API is a
direct OpenAI clone), `@tanstack/ai-openrouter` is the most heavily
overridden (different SDK, camelCase fields, multi-provider routing).
