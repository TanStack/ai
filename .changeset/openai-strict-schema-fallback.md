---
'@tanstack/openai-base': patch
---

fix(openai): emit `strict: false` for function tools whose JSON Schema is outside OpenAI's strict subset

The Responses and Chat Completions tool converters forced `strict: true` on
every function tool. When a tool's schema uses keywords OpenAI's strict
Structured Outputs subset doesn't support (`oneOf`/`allOf`/`not`/`$ref`/
`$defs` — routinely emitted by MCP servers such as Notion), the API rejected
the **entire** request with `400 Invalid schema for function '…'`, breaking
every run that included such a tool.

These converters now detect schemas outside the strict subset
(`isStrictModeCompatible`) and emit those tools with `strict: false` — the
schema is passed through (only unsupported `format` keywords are stripped) so
the tool stays callable. Schemas that fit the strict subset keep `strict: true`
and the existing structured-output coercion, so well-behaved tools are
unaffected.
