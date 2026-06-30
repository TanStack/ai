# @tanstack/ai-mcp

## 0.2.0

### Minor Changes

- [#843](https://github.com/TanStack/ai/pull/843) [`c1a8732`](https://github.com/TanStack/ai/commit/c1a87327b4a3463d37158f32ca90184b5fd092bb) - feat: MCP Apps support — render interactive `ui://` widgets served by MCP servers

  Adds support for the ratified [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview) standard, letting MCP server tools return interactive UI widgets that render in the chat.
  - **`@tanstack/ai`** — MCP tool results that link a `ui://` resource (via `_meta.ui.resourceUri`) now surface as a new `UIResourcePart` on the assistant `UIMessage` (carried as an AG-UI `CUSTOM` event). The widget never enters model input. The `ui://` resource is read eagerly during the run, fail-soft.
  - **`@tanstack/ai-mcp`** — tool discovery now captures `serverId` + the UI resource link; `MCPClient` gains a public `callTool` and `getInfo()` (returns the client's transport descriptor); `MCPClients` gains `getServers()` (returns all pool entries' descriptors). New `@tanstack/ai-mcp/apps` subpath exports `createMcpAppCallHandler` — a server-side tool-call proxy for interactive widgets that takes the MCP client(s)/pool you already created (`clients: MCPClient | MCPClients | Array<MCPClient | MCPClients>`), reads each client's transport descriptor via `MCPClient.getInfo()` / `MCPClients.getServers()` (pure config, no live socket required), and **reconnects per call** (stateless, serverless-safe by default, same-server allowlist). Also exports an in-memory `McpSessionStore` seam for stateful transports.
  - **`@tanstack/ai-client`** — `createMcpAppBridge`, a framework-agnostic bridge routing widget tool-calls to the call handler, follow-up prompts into the chat, and blocking links unless a handler is supplied.
  - **`@tanstack/ai-react` / `@tanstack/ai-preact`** — a `MCPAppResource` component (new `./mcp-apps` subpath) that renders a `UIResourcePart` via `@mcp-ui/client`'s `AppRenderer` (optional peer dependency), wired to the bridge. Plus a `useMcpAppBridge` hook (main entry) that returns a stable `createMcpAppBridge` for a given `threadId`/`callEndpoint` while always calling the latest `sendMessage`/`onLink`.

  Persistence is intentionally out of scope (in-memory seams only); Solid/Vue/Svelte/Angular renderers are deferred (the renderer SDK is currently React-only).

### Patch Changes

- Updated dependencies [[`c1a8732`](https://github.com/TanStack/ai/commit/c1a87327b4a3463d37158f32ca90184b5fd092bb)]:
  - @tanstack/ai@0.38.0

## 0.1.10

### Patch Changes

- [#844](https://github.com/TanStack/ai/pull/844) [`a6cceba`](https://github.com/TanStack/ai/commit/a6cceba4812e7e986183ee856112fcf5f8fa12ff) - Republish all packages with their compiled `dist/` output.

  Releases `0.33.0`–`0.36.0` were published without a `dist/` directory: the
  release workflow relied on an Nx-cached `build` whose outputs were not
  materialized to disk before `changeset publish` packed the tarballs, and
  `files: ["dist"]` silently includes nothing when `dist/` is absent. The
  published packages therefore contained only `src/`, so every export
  (`./dist/esm/*.js`) resolved to a missing file and the packages were
  uninstallable.

  The publish step now runs a fresh, cache-bypassing build of all packages
  immediately before publishing, guaranteeing compiled artifacts are present in
  every tarball.

- Updated dependencies [[`a6cceba`](https://github.com/TanStack/ai/commit/a6cceba4812e7e986183ee856112fcf5f8fa12ff)]:
  - @tanstack/ai@0.37.0

## 0.1.9

### Patch Changes

- Updated dependencies [[`fbd3762`](https://github.com/TanStack/ai/commit/fbd37623b287e370aa5678e161dec19cf13ae33b)]:
  - @tanstack/ai@0.36.0

## 0.1.8

### Patch Changes

- Updated dependencies [[`c04abd3`](https://github.com/TanStack/ai/commit/c04abd35284d464d830bb9f15129c7a7c2533d3f)]:
  - @tanstack/ai@0.35.0

## 0.1.7

### Patch Changes

- [#754](https://github.com/TanStack/ai/pull/754) [`df40512`](https://github.com/TanStack/ai/commit/df40512bda853f714b2913bee630ec599e664207) - Fix `@tanstack/ai-mcp` CLI crashing on startup with `Error: Dynamic require of "fs" is not supported`. The CLI ships as an ESM bundle with `json-schema-to-typescript` inlined, which uses CJS `require()` internally. Enabling tsup's `shims` option injects a `createRequire(import.meta.url)` shim so those `require()` calls resolve correctly.

- Updated dependencies [[`4188693`](https://github.com/TanStack/ai/commit/4188693d09297ce400eb1ba5fab30cfea2fdb8a6)]:
  - @tanstack/ai@0.34.1

## 0.1.6

### Patch Changes

- Updated dependencies [[`31de22b`](https://github.com/TanStack/ai/commit/31de22b1ae780c53e3abbf9cf17e1db7b62de84a)]:
  - @tanstack/ai@0.34.0

## 0.1.5

### Patch Changes

- Updated dependencies [[`2cb0313`](https://github.com/TanStack/ai/commit/2cb0313c1f13e1db37c5550308e36bb0b9b73b98), [`18e5f4d`](https://github.com/TanStack/ai/commit/18e5f4d9746a26c3194929ea4b49673728e8eaa5), [`21720dd`](https://github.com/TanStack/ai/commit/21720dd73524d624594a6dfb7e4669c03cc08af0), [`243b8fa`](https://github.com/TanStack/ai/commit/243b8fad7e8a48b68a1a96962ee1443cbd6a0ced)]:
  - @tanstack/ai@0.33.0

## 0.1.4

### Patch Changes

- Updated dependencies [[`8fa6cc5`](https://github.com/TanStack/ai/commit/8fa6cc56c5f36e22885c98a511dcceb2bfc0da1f), [`8fa6cc5`](https://github.com/TanStack/ai/commit/8fa6cc56c5f36e22885c98a511dcceb2bfc0da1f)]:
  - @tanstack/ai@0.32.0

## 0.1.3

### Patch Changes

- Updated dependencies [[`07aaf8b`](https://github.com/TanStack/ai/commit/07aaf8b9e5a8e699be25f936cc9cd651a46c16c5)]:
  - @tanstack/ai@0.31.0

## 0.1.2

### Patch Changes

- [#769](https://github.com/TanStack/ai/pull/769) [`1d1bb52`](https://github.com/TanStack/ai/commit/1d1bb5219a38d9718cc926148e93fc27d5d2305b) - Add repository metadata (`homepage`, `bugs`, `funding`), fix `repository.directory` to point at each package, and include an MIT `LICENSE` file in every published package.

- Updated dependencies [[`7103348`](https://github.com/TanStack/ai/commit/71033488212bff05dcccc857e721ab9262ebc2a6), [`1d1bb52`](https://github.com/TanStack/ai/commit/1d1bb5219a38d9718cc926148e93fc27d5d2305b)]:
  - @tanstack/ai@0.30.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`ff267a5`](https://github.com/TanStack/ai/commit/ff267a5536327b006979f9f28ce2df7cc27f6e23), [`570c08a`](https://github.com/TanStack/ai/commit/570c08a8d1a35746c3d31a63188249cba2d2475a), [`22c9b42`](https://github.com/TanStack/ai/commit/22c9b42baec74914b720e440f29bd02be04eb164), [`215b6b4`](https://github.com/TanStack/ai/commit/215b6b401aa95d1d38da342aa09603cb1d616929), [`7d44569`](https://github.com/TanStack/ai/commit/7d445693ea079d7a85498a4465179ddd5f548cb0)]:
  - @tanstack/ai@0.29.0

## 0.1.0

### Minor Changes

- [#700](https://github.com/TanStack/ai/pull/700) [`496e814`](https://github.com/TanStack/ai/commit/496e8143435746965b10e0bbd12f26ebf04ae2a6) - Add `@tanstack/ai-mcp`: a host-side Model Context Protocol client. Discover and run MCP server tools (and read resources/prompts) inside any adapter's `chat()` loop, with three type-safety modes (auto-discovery, hand-written `toolDefinition()` binding, and generated end-to-end types via `npx @tanstack/ai-mcp generate`). Includes `createMCPClients` for connecting to multiple servers with auto-prefixed tool names. Also exposes `abortSignal` on `ToolExecutionContext` so long-running tools (e.g. MCP `callTool`) cancel with the chat run.

### Patch Changes

- Updated dependencies [[`496e814`](https://github.com/TanStack/ai/commit/496e8143435746965b10e0bbd12f26ebf04ae2a6), [`c0af426`](https://github.com/TanStack/ai/commit/c0af4262d269be67c69d6f878d9618f25fdeee19), [`00e0c93`](https://github.com/TanStack/ai/commit/00e0c932e6cb5e31f75f4b5e94486d7eb02b9ce1), [`496e814`](https://github.com/TanStack/ai/commit/496e8143435746965b10e0bbd12f26ebf04ae2a6)]:
  - @tanstack/ai@0.28.0
