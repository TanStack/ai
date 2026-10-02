---
'@tanstack/ai-mcp': minor
'@tanstack/ai': patch
---

`createMCPServer` from `@tanstack/ai-mcp/server`:

- A resource `read(uri, variables, ctx)` now gets the requested URI, the template variables, and `ctx.context` (the `handle` context plus `authInfo`). A template resource can take `list(ctx)` for `resources/list`.
- `metadata._meta` on a tool definition is sent as the MCP tool `_meta`, so a tool can link an MCP Apps view with `_meta.ui.resourceUri`.
- New `sessions: 'stateless'` serves spec 2025 clients without a session store, for Cloudflare Workers and other multi-instance hosts. In that mode `ctx.context.requestInput` throws a clear error, and `ctx.context.sample` uses the `sample` option.
- New `onerror` option receives SDK transport and protocol errors, including the `serveMCPStdio` transport errors.
- Tool and prompt schemas are converted and compiled once at `createMCPServer`, not on every request.
- Output schemas are advertised from the output view, and tool results are parsed with the output schema, so a transform or pipe no longer fails the structured-content check. Async output schemas work. Output that fails its schema returns a tool error that names the tool. An output schema with a bare transform advertises no output schema.
- `createMCPClient({ server })` parses tool output the same way, and `readResource(uri, context)` takes a context for the resource.
- `MCPResourceContext`, `MCPResourceRead`, and `MCPResourceList` are exported. `resourceDefinition` accepts `list` only with `uriTemplate`.

`convertSchemaToJsonSchema` from `@tanstack/ai` takes a new `io: 'input' | 'output'` option.
