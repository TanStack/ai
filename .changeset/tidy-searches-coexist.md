---
'@tanstack/ai': patch
'@tanstack/ai-anthropic': patch
'@tanstack/ai-gemini': patch
'@tanstack/ai-grok': patch
'@tanstack/ai-openai': patch
'@tanstack/ai-openrouter': patch
'@tanstack/openai-base': patch
---

Classify Anthropic, Gemini, and OpenAI native tools with stable runtime discriminators so ordinary functions can use the same public names without selecting provider-native behavior. Native tools must come from the adapter factory (`webSearchTool()`, `googleSearchTool()`, and the rest). A reserved `name` alone does not select a native converter. `chat()` throws `DuplicateToolNameError` when a factory tool and a custom function share the same public name.

Previously the converters picked provider-native behavior by `tool.name`. Tool names are public application identifiers, so a plain function called `web_search`, `google_search`, or `code_execution` was routed into a native converter: it lost its `inputSchema` and was sent as a provider-only payload (and on Anthropic could also flip on `code_execution` / skills beta headers). Native tools are now identified by adapter-owned metadata, which converters strip before building the wire payload, so provider API versions stay confined to the wire converters.

Also preserves Anthropic `webSearchTool` options (`max_uses`, `allowed_domains`, `blocked_domains`, `user_location`, `cache_control`) on the wire payload.

Also fixes `googleSearchTool({ searchTypes: … })` being silently dropped on the experimental `geminiTextInteractions()` adapter. The Interactions converter read a snake_case `search_types` array, but the public factory takes the Generate Content shape (`GoogleSearch.searchTypes: { webSearch?, imageSearch? }`), so the field never matched and every request fell back to the provider default of web-search-only. The camelCase config is now translated to the Interactions wire list.
