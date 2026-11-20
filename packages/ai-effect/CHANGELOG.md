# @tanstack/ai-effect

## 0.1.2

### Patch Changes

- [#2184](https://github.com/TanStack/ai/pull/2184) [`4288b7a`](https://github.com/TanStack/ai/commit/4288b7aaa80e085df899e2bebb597a9f85d6fb71) - A server tool can now send result metadata: app data that the UI and middleware see and the model never sees. Call `context?.setResultMetadata?.(value)` in the tool. Add `resultMetadataSchema` to the tool definition to type and check the value. The client reads it as a typed `part.resultMetadata` on the tool-call part, also after a reload with persistence.
  - `onAfterToolCall` gets `info.metadata`. A `replaceResult` or `skip` decision can set `metadata`. `toolCacheMiddleware` keeps the metadata on a cache hit.
  - `@tanstack/ai-mcp` copies the `_meta` of an MCP tool result into the result metadata. A `tanstack` key is dropped.
  - `@tanstack/ai-persistence` keeps the stored app metadata when a client copy replaces a stored tool message. The `'messages.metadata'` conformance check now also tests a tool message with nested app metadata.
  - The server owns the result metadata. `chatParamsFromRequest` keeps only the `tanstack` key on the tool rows of a request.
  - Client tools and WebMCP tools throw when they call `setResultMetadata`.
  - `@tanstack/ai-effect` accepts tool definitions that have `resultMetadataSchema`.
  - `@tanstack/ai-event-client` adds `metadata` to the tool result event. The devtools show it as "Result metadata" on each tool result.

- Updated dependencies [[`1aa7227`](https://github.com/TanStack/ai/commit/1aa722707deca4d567efafe0830471222d558b62), [`0a84ac2`](https://github.com/TanStack/ai/commit/0a84ac22cbd29ac49997091713ca9da81bb3e553), [`4288b7a`](https://github.com/TanStack/ai/commit/4288b7aaa80e085df899e2bebb597a9f85d6fb71)]:
  - @tanstack/ai@1.7.0

## 0.1.1

### Patch Changes

- [#2094](https://github.com/TanStack/ai/pull/2094) [`a07f1dc`](https://github.com/TanStack/ai/commit/a07f1dc3cefc50bc484b5d55cdb757804c6f4065) - Interrupting a `chat` Stream, with `Stream.take` or `Fiber.interrupt`, now runs the middleware `onAbort` hook, and the interrupt completes after the run's teardown.

## 0.1.0

### Minor Changes

- [#2074](https://github.com/TanStack/ai/pull/2074) [`4f2eea7`](https://github.com/TanStack/ai/commit/4f2eea7b4c62c937700c56357a6ab37dfc21264d) - Add `@tanstack/ai-effect`, a new package that runs every TanStack AI activity as an Effect or a Stream and lets you write server tools as Effects.
