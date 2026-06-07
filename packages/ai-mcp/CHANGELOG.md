# @tanstack/ai-mcp

## 0.1.0

### Minor Changes

- [#700](https://github.com/TanStack/ai/pull/700) [`496e814`](https://github.com/TanStack/ai/commit/496e8143435746965b10e0bbd12f26ebf04ae2a6) - Add `@tanstack/ai-mcp`: a host-side Model Context Protocol client. Discover and run MCP server tools (and read resources/prompts) inside any adapter's `chat()` loop, with three type-safety modes (auto-discovery, hand-written `toolDefinition()` binding, and generated end-to-end types via `npx @tanstack/ai-mcp generate`). Includes `createMCPClients` for connecting to multiple servers with auto-prefixed tool names. Also exposes `abortSignal` on `ToolExecutionContext` so long-running tools (e.g. MCP `callTool`) cancel with the chat run.

### Patch Changes

- Updated dependencies [[`496e814`](https://github.com/TanStack/ai/commit/496e8143435746965b10e0bbd12f26ebf04ae2a6), [`c0af426`](https://github.com/TanStack/ai/commit/c0af4262d269be67c69d6f878d9618f25fdeee19), [`00e0c93`](https://github.com/TanStack/ai/commit/00e0c932e6cb5e31f75f4b5e94486d7eb02b9ce1), [`496e814`](https://github.com/TanStack/ai/commit/496e8143435746965b10e0bbd12f26ebf04ae2a6)]:
  - @tanstack/ai@0.28.0
