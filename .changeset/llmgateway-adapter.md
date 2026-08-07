---
'@tanstack/ai-llmgateway': minor
'@tanstack/ai': patch
---

New provider adapter: `@tanstack/ai-llmgateway` connects TanStack AI to
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
