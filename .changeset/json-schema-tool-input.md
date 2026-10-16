---
'@tanstack/ai': minor
---

Check a raw JSON Schema tool input before the tool runs. This covers plain JSON Schema tools and every MCP tool.

Behavior change:

- A tool with a JSON Schema `inputSchema` now gets a tool error (state `output-error`) when the input does not fit the schema. The tool does not run. Before, any input ran.
- The check runs at the same place as the Standard Schema check: after approval edits and middleware `onBeforeToolCall`.
- The draft comes from `$schema` (draft-04, draft-07, 2019-09, 2020-12). With no `$schema`, the check uses 2020-12. `format` is not checked.
- OpenAPI 3.0 schemas work: `nullable: true` lets the field be `null`, and a boolean `exclusiveMinimum` or `exclusiveMaximum` works in every draft.
- The error names each failed location (up to 10) and shows the received arguments: `Input validation failed for tool <name>: #/count: ...`.
- A schema that the check cannot use, such as one with a remote `$ref`, gives a tool error on each call.
- The check uses `@cfworker/json-schema`. It does not compile code, so it runs on Cloudflare Workers.

Migration: if a JSON Schema tool must accept input that its schema rejects, widen the schema.
