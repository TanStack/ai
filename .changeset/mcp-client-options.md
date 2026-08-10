---
'@tanstack/ai-mcp': minor
---

`createMCPClient` and `createMCPClientFromTransport` now accept `clientOptions`, forwarded verbatim to the MCP SDK's `Client`. The option that motivated this is `jsonSchemaValidator`: the SDK validates a tool's `structuredContent` against its declared `outputSchema`, and its default AJV validator compiles each schema by building JavaScript source and handing it to `new Function`. Edge runtimes forbid that, so on Cloudflare Workers a `tools/list` against any server whose tools declare an `outputSchema` failed with `Error compiling schema` (AJV's wrapper around `Code generation from strings disallowed for this context`) — and because validators are built during discovery rather than on call, that took down the whole run, not one tool. The SDK ships the fix (`CfWorkerJsonSchemaValidator`, backed by the optional peer `@cfworker/json-schema`) but it is only installable through `ClientOptions`, which this package did not expose.
