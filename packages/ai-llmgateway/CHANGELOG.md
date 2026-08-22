# @tanstack/ai-llmgateway

## 0.1.2

### Patch Changes

- Updated dependencies [[`b7ebcb0`](https://github.com/TanStack/ai/commit/b7ebcb0bbe63e425facb5e38f138bd0cd36637dd)]:
  - @tanstack/ai@0.49.0
  - @tanstack/openai-base@0.10.4

## 0.1.1

### Patch Changes

- Updated dependencies [[`1c0415b`](https://github.com/TanStack/ai/commit/1c0415bec4bbefcd3abf784d0209af05aca5db46)]:
  - @tanstack/ai@0.48.0
  - @tanstack/openai-base@0.10.3

## 0.1.0

### Minor Changes

- [#1016](https://github.com/TanStack/ai/pull/1016) [`d34b6c0`](https://github.com/TanStack/ai/commit/d34b6c01fbc9ed83e5dc9bd2725eb05f6b03bfd4) - New provider adapter: `@tanstack/ai-llmgateway` connects TanStack AI to
  [LLM Gateway](https://llmgateway.io), an open-source, self-hostable AI
  gateway that routes one OpenAI-compatible endpoint to hundreds of models
  across many providers.
  - `llmGatewayText` / `createLLMGatewayText` — streaming chat with tool
    calling, structured outputs, multimodal (image) input, and reasoning
    deltas (`reasoning_content`) surfaced as AG-UI `REASONING_*` events
  - `llmGatewaySummarize` / `createLLMGatewaySummarize` — summarization via
    the shared `ChatStreamSummarizeAdapter`
  - `LLMGATEWAY_CHAT_MODELS` — a curated list of flagship model ids, with
    per-model input modalities and tool capabilities resolved at the type
    level, and any other model id from llmgateway.io/models accepted and
    typed against the generic provider options
  - `provider/model` ids pin routing to a specific provider; bare ids let
    the gateway choose

  `@tanstack/ai` registers `llmgateway` in the summarize wrapper's
  provider-native token-key map, so `summarize({ maxLength })` reaches the
  gateway as `max_tokens` instead of being dropped with a warning.

### Patch Changes

- Updated dependencies [[`7c4b73a`](https://github.com/TanStack/ai/commit/7c4b73af5023e7ab7e113121644213c75d611aac), [`87e497f`](https://github.com/TanStack/ai/commit/87e497f2e282c2389579051ec743fa4cc8cf493e), [`ff27fde`](https://github.com/TanStack/ai/commit/ff27fdeb2e134cb4c2b69e6809774477ffdc26a0), [`c0ba484`](https://github.com/TanStack/ai/commit/c0ba48402a807d6482e1cb36a0cf393d0cd26b2b), [`d34b6c0`](https://github.com/TanStack/ai/commit/d34b6c01fbc9ed83e5dc9bd2725eb05f6b03bfd4), [`66ba92c`](https://github.com/TanStack/ai/commit/66ba92cb5c2cfaf07ee2269306048e2fd4f788fe)]:
  - @tanstack/ai@0.47.3
  - @tanstack/openai-base@0.10.2
