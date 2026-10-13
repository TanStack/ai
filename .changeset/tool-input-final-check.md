---
'@tanstack/ai': minor
---

Check a tool input at the last moment, just before the tool runs or the client gets the call.

Behavior change:

- The tool's Standard Schema `inputSchema` now checks the input after approval `editedArgs` and after middleware `onBeforeToolCall`. Before, edits and `transformArgs` values reached `execute` or the client without a check. An input that does not fit the schema now becomes a tool error (state `output-error`), and the tool does not run.
- `onBeforeToolCall` gets the parsed input before the schema check. It has no schema defaults or transforms yet, and it can be invalid.
- Async Standard Schema input validators are awaited. Before, they threw.
- The tool gets the schema's output, so a transform applies once.
- `onBeforeToolCall` now also runs for a client tool before the server sends the call to the client. This includes a client request at an interrupt boundary. It does not run while a call waits for approval, for a denied call, or when the client result comes back. `otelMiddleware` records no `execute_tool` span for a client tool, because the server does not run it.
- A validation error after the hook runs `onAfterToolCall` with `ok: false`.
- The error text now also shows the received arguments.

Migration:

- If a middleware `transformArgs` or an approval edit sends a value that the schema rejects, make the value fit the schema, or widen the schema.
- If `onBeforeToolCall` reads `hookCtx.args`, check its shape first. Do not expect schema defaults there.
- If a middleware counts or blocks calls in `onBeforeToolCall` and must see only server tools, return early when `hookCtx.tool?.execute` is missing.
