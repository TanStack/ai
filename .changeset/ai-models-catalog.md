---
'@tanstack/ai-models': minor
---

New package: a runtime catalog of 1,932 models across 38 providers, generated from models.dev and the OpenRouter and Vercel AI Gateway model lists. `getProviders`, `getModels`, and `getModel` return each model's id, input modalities, context window, output limit, prices, reasoning levels, and request quirks (`compat`). `supportedReasoningLevels`, `clampReasoningLevel`, and `modelCost` work on a record, and `generatedAt` is the time of the data. Each provider also has its own subpath, for example `@tanstack/ai-models/deepseek`.
