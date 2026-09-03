# @tanstack/ai-llmgateway

## 0.1.6

### Patch Changes

- Updated dependencies [[`21775ee`](https://github.com/TanStack/ai/commit/21775ee2d23dd594cdc184678ff587341bd74871)]:
  - @tanstack/ai@0.53.0
  - @tanstack/openai-base@0.10.10

## 0.1.5

### Patch Changes

- Updated dependencies [[`49fc54c`](https://github.com/TanStack/ai/commit/49fc54ca0aacf2fc60bb36647a61a23559dda4bc), [`e04ff6a`](https://github.com/TanStack/ai/commit/e04ff6abcb86c5ede17cd8c1c96df82e9aae03d7), [`e04ff6a`](https://github.com/TanStack/ai/commit/e04ff6abcb86c5ede17cd8c1c96df82e9aae03d7)]:
  - @tanstack/ai@0.52.0
  - @tanstack/openai-base@0.10.8

## 0.1.4

### Patch Changes

- Updated dependencies [[`43b51f2`](https://github.com/TanStack/ai/commit/43b51f2e89db1c9fb23bb34b4ea4e052d370fb31), [`5dc4e1a`](https://github.com/TanStack/ai/commit/5dc4e1a08728b410f85956093ccef621d12b4d6b), [`a7e0798`](https://github.com/TanStack/ai/commit/a7e079872af372496728d25e6ec23149cd5e04b9), [`6a083bf`](https://github.com/TanStack/ai/commit/6a083bfcfaa4fd0c83368c4d10067e5c2298e22c)]:
  - @tanstack/openai-base@0.10.7
  - @tanstack/ai@0.51.0

## 0.1.3

### Patch Changes

- [#1253](https://github.com/TanStack/ai/pull/1253) [`8147e66`](https://github.com/TanStack/ai/commit/8147e6680996fc6f6c2d73294135ee0ccd5d1697) - Stop requiring Zod as a peer dependency when the adapters do not import it at runtime.

- Updated dependencies [[`62c19ed`](https://github.com/TanStack/ai/commit/62c19edce7a814d868491ca920003899ec4c486b), [`62c19ed`](https://github.com/TanStack/ai/commit/62c19edce7a814d868491ca920003899ec4c486b)]:
  - @tanstack/ai@0.50.0
  - @tanstack/openai-base@0.10.6

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
