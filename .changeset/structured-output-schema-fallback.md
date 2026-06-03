---
'@tanstack/ai': minor
'@tanstack/ai-anthropic': minor
'@tanstack/ai-openrouter': minor
---

Add a `structuredOutput` strategy option to `chat()` and gracefully fall back when a provider rejects a large structured-output schema. Closes #682.

Since the native single-pass tool+schema path landed for Claude 4.5+, `chat({ outputSchema })` routes Claude structured output through Anthropic's `output_config`. For a large/complex schema Anthropic rejects the request with _"The compiled grammar is too large"_ (or the docs' canonical _"Schema is too complex for compilation"_) and the run hard-failed with a `RUN_ERROR` and no recovery (also reproducible for `anthropic/*` models via OpenRouter).

`chat()` now accepts `structuredOutput: 'auto' | 'native' | 'tool'` (default `'auto'`):

- `'native'` — use the provider's native structured-output API. No fallback.
- `'tool'` — force the lenient forced-tool path (a non-strict `structured_output` tool with forced `tool_choice`), which avoids strict-grammar compilation. Use for known-large schemas.
- `'auto'` (default) — try `'native'`; if the provider rejects the schema, transparently re-run via `'tool'`. The recovered run yields a single clean lifecycle (the abandoned native attempt's events are withheld). Providers without a forced-tool fallback behave like `'native'`.

Detection is delegated to a new optional adapter predicate `isStructuredOutputSchemaError(error)`, so the core stays free of provider-specific error strings. `@tanstack/ai-anthropic` matches its `output_config` grammar rejection (and uses its existing forced-tool `structuredOutput` for `'tool'`); `@tanstack/ai-openrouter` matches the forwarded Anthropic grammar message and gains a forced-tool structured-output mode.

Backward compatible: the default `'auto'` only changes behavior on the previously-hard-failing schema-rejection path; small schemas and other providers are unaffected.
