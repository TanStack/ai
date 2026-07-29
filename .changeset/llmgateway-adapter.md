---
'@tanstack/ai-llmgateway': minor
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
- Curated model metadata (context windows, pricing, modalities) for
  flagship models, with any other model id from llmgateway.io/models
  accepted and typed against the generic provider options
- `provider/model` ids pin routing to a specific provider; bare ids let
  the gateway choose
