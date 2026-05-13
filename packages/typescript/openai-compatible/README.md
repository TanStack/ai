# @tanstack/openai-compatible

Shared protocol adapters for OpenAI-compatible providers in TanStack AI.

> Renamed from `@tanstack/openai-base` in 0.3.0. The "base" name implied this package
> tracked OpenAI's product roadmap; in fact it implements two OpenAI-shaped *wire
> formats* that multiple providers ship — see below.

## What this package is

This package holds the shared implementation of the two OpenAI-compatible
wire-format protocols:

- **Chat Completions** (`/v1/chat/completions`) — mature, natively implemented by
  OpenAI, Groq, Grok, OpenRouter, vLLM, SGLang, Together, Ollama (compat layer),
  and many others.
- **Responses** (`/v1/responses`) — newer; OpenAI's reference implementation plus
  OpenRouter's beta routing implementation (which fans out to Anthropic, Google,
  etc. under the hood). Younger protocol, fewer native implementers today.

Both are exposed as abstract classes that providers subclass:

- `OpenAICompatibleChatCompletionsTextAdapter`
- `OpenAICompatibleResponsesTextAdapter`

Subclasses customize SDK-shape variance via a small set of protected hook
methods: `callChatCompletion`, `callChatCompletionStream`, `extractReasoning`,
`convertMessage`, `mapOptionsToRequest`, `transformStructuredOutput`,
`makeStructuredOutputCompatible`, `processStreamChunks` (and the equivalent set
on the Responses adapter).

## What this package is not

It is **not** the base for OpenAI's evolving product surface. OpenAI-specific
tools (e.g. `web_search_preview`, `code_interpreter`, `local_shell`),
OpenAI-only models, and OpenAI's product behaviors live in
[`@tanstack/ai-openai`](../ai-openai), not here.

The distinction matters because it tells contributors where to add things:

- Adding a field to a class in this package is a claim that the field is
  supported by **multiple** OpenAI-compatible providers (not just OpenAI).
  Otherwise it belongs as an override or extension in the provider's own
  package.
- If OpenAI ships a new field that no other provider supports yet, it goes in
  `@tanstack/ai-openai` and is plumbed into this base only once a second
  provider has adopted it.

## Architecture context

Every text adapter in TanStack AI — regardless of provider — emits
[AG-UI](https://github.com/CopilotKit/ag-ui) events (`RUN_STARTED`,
`TEXT_MESSAGE_*`, `TOOL_CALL_*`, `RUN_FINISHED`, …) as its output stream. That
is the *universal* unification.

Input protocols are different. The OpenAI-compatible family (covered by this
package) has many implementers and warrants a shared base. Anthropic, Google
Gemini, and Ollama have single-provider input protocols and their adapters
extend `BaseTextAdapter` from `@tanstack/ai` directly — no compatible base
exists because no compatible family exists.

## Direct use

Most users don't import from this package directly; they install a provider
package (`@tanstack/ai-openai`, `@tanstack/ai-openrouter`,
`@tanstack/ai-groq`, `@tanstack/ai-grok`) which extends the bases here.

If you're building a custom OpenAI-compatible provider adapter (e.g. for vLLM,
Together, Fireworks), you can extend the bases from this package directly. See
the existing providers as worked examples.
