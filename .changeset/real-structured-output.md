---
'@tanstack/ai-anthropic': minor
---

Use Anthropic's native structured output API instead of the tool-use workaround

Upgrades `@anthropic-ai/sdk` from ^0.71.2 to ^0.74.0 and migrates structured output to use the GA `output_config.format` with `json_schema` type. Previously, structured output was emulated by forcing a tool call and extracting the input — this now uses Anthropic's first-class structured output support for more reliable schema-constrained responses.

Also migrates streaming and tool types from `client.beta.messages` to the stable `client.messages` API, replacing beta type imports (`BetaToolChoiceAuto`, `BetaToolBash20241022`, `BetaRawMessageStreamEvent`, etc.) with their GA equivalents.

**No breaking changes to runtime behavior.** However, this is a **type-level breaking change** for TypeScript consumers who import tool choice or streaming types directly: the beta type exports (`BetaToolChoiceAuto`, `BetaToolChoiceTool`, `BetaRawMessageStreamEvent`, etc.) have been replaced with their GA equivalents (`ToolChoiceAuto`, `ToolChoiceTool`, `RawMessageStreamEvent`, etc.) from `@anthropic-ai/sdk/resources/messages`. Consumers referencing these types will need to update both the import paths and the type names accordingly.
