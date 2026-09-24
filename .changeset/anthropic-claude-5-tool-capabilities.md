---
'@tanstack/ai-anthropic': patch
---

Restore the provider tool list and combined tools-and-schema support for `claude-opus-5` and `claude-fable-5-1`.

Both models were inserted by the model sync with `supports.tools: []`, which the sync writes for every new Anthropic model. The curated list is filled in by hand afterwards, and that step was missed for these two. `ResolveToolCapabilities` reads the generated tool-capabilities map, so a caller on either model could not pass `webSearchTool`, `webFetchTool`, `codeExecutionTool`, `computerUseTool`, `bashTool`, `textEditorTool`, or `memoryTool` without a type error, while the same call type-checked on `claude-opus-4-1`.

The two models were also missing from `ANTHROPIC_COMBINED_TOOLS_AND_SCHEMA_MODELS`, so `supportsCombinedToolsAndSchema()` returned `false` and structured output alongside tools fell back to the forced-tool-use workaround kept for pre-4.5 models instead of `output_config.format`.

`claude-opus-5` also did not declare `AnthropicOutputConfigOptions` in its provider-options type. The adapter merges `output_config.format` over any caller-supplied `output_config`, so a caller on this model could not tune `output_config.effort` alongside the schema. Opus 4.7, Opus 4.8, Sonnet 5, Fable 5 and Fable 5.1 all declare it.

`claude-opus-5-fast` keeps an empty tool list: it is absent from the supported-model lists for code execution, computer use, and structured outputs. The per-model type-safety suite now asserts that it is the only registered model without provider tools, so the next model inserted with an empty list fails the suite instead of shipping.
