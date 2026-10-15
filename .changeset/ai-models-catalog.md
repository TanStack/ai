---
'@tanstack/ai-models': minor
---

New package: a runtime catalog of more than 1,900 models across 38 providers, generated from modelschemas. `getProviders`, `getModels`, and `getModel` return each model's id, input modalities, context window, output limit, prices, reasoning data, and request quirks (`compat`). A record's `reasoning` has the `ModelReasoning` shape of `@tanstack/ai` (`false`, or `{ levels, budget }`). `supportedReasoningLevels`, `clampReasoningLevel`, and `modelCost` work on a record, and `generatedAt` is the date of the data. Each provider also has its own subpath, for example `@tanstack/ai-models/deepseek`.

`modelCost` prices long context and 1-hour cache writes. A record's `cost.tiers` holds higher prices above an input size, and a call uses the tier with the highest `inputTokensAbove` below its input. `TokenCounts.cacheWrite1h`, the part of `cacheWrite` with a 1-hour retention, costs 2 times the input price.

The `google-vertex` and `azure-openai-responses` providers have only the models on their own wire, so no Claude models. Use `anthropicVertexText` from `@tanstack/ai-anthropic/vertex` for Claude on Vertex. Embedding, reranking, and transcription models are not in the catalog.
