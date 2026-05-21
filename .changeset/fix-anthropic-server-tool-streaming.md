---
'@tanstack/ai-anthropic': patch
---

Fix streaming corruption when Anthropic responses mix client `tool_use` with server-side tools (`web_fetch`, `web_search`). Closes #604.

The Anthropic streaming adapter previously had no handler for `server_tool_use` / `web_fetch_tool_result` / `web_search_tool_result` content blocks. When a client `tool_use` was followed by a `server_tool_use` in the same response, the server tool's `input_json_delta` events appended onto the prior client tool's input buffer — producing concatenated JSON like `{...prevToolArgs...}{"url":"..."}` that threw in the agent loop's `JSON.parse`.

- `server_tool_use` is now tracked in a separate buffer so its deltas can't bleed into client tool args.
- `input_json_delta` is dispatched by the current block type instead of unconditionally appending to `toolCallsMap[currentToolIndex]`.
- `web_fetch_tool_result` and `web_search_tool_result` blocks are explicitly acknowledged (and ignored — they are consumed by Anthropic, not the client), so they no longer fall through to the text-block handler.

No new public events are introduced: server-side tool execution stays internal to the provider, matching how `webFetchTool()` / `webSearchTool()` were always intended to be used.
