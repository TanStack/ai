---
'@tanstack/ai-openrouter': minor
---

Add native combined tools + `outputSchema` mode to both OpenRouter text adapters (chat-completions and Responses). When the resolved upstream model supports emitting a schema-constrained final answer alongside tool calls in a single pass, `chat({ outputSchema, tools, stream: true })` now wires the JSON Schema into the same streaming request as the tools and harvests the final-turn JSON, skipping the separate finalization round-trip.

Because OpenRouter is a routing layer, capability is keyed per resolved upstream model via the new `OPENROUTER_COMBINED_TOOLS_AND_SCHEMA_MODELS` set, exported from `@tanstack/ai-openrouter/model-meta`, which both adapters consult from `supportsCombinedToolsAndSchema()`. The set is derived from each upstream provider's combined-mode gate (Anthropic 4.5+, Gemini 3.x, OpenAI's strict `json_schema` era, Grok 4.x) rather than the broader catalog `responseFormat` flag, so models that advertise structured output but predate native combined mode stay on the legacy finalization path.
