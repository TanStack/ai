# @tanstack/ai-acp

## 0.2.1

### Patch Changes

- Updated dependencies [[`5deda27`](https://github.com/TanStack/ai/commit/5deda27085c8785894a28feb5bb3655dbd8f7e0a)]:
  - @tanstack/ai@0.40.0
  - @tanstack/ai-sandbox@0.2.2

## 0.2.0

### Minor Changes

- [#774](https://github.com/TanStack/ai/pull/774) [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4) - Add `acpCompatible` / `acpCompatibleText` — the harness equivalent of `openaiCompatible`. Build a `chat()` text adapter for any ACP-compliant agent CLI and plug it into a sandbox without a dedicated adapter package: configure `command` (stdio) or `openTransport` (WebSocket/custom) once, then select a model per call. Handles sandbox resolution, tool→MCP bridging, session resume, permission modes (`headless` / `interactive`), abort, and AG-UI translation. Also exports the shared `buildAcpPrompt` helper.

  Typed configuration (parity with `openaiCompatible`): declare `models` for a type-safe model union, and a `modelOptions` brand (`{} as { … }`) for the per-call options accepted via `chat({ modelOptions })`. Declared options are merged with the base ACP options and exposed on `ctx.modelOptions` in `command` / `openTransport` so they can become CLI flags.

  ACP client compliance: the `initialize` handshake now sends `clientInfo` and validates the negotiated protocol version. The stream translator surfaces non-text agent content (image/audio/resource blocks) as a `CUSTOM` event (via the new optional `contentEvent` translate label; `acpCompatible` enables it as `<name>.message-content`) instead of dropping it, and preserves non-text tool content (diffs, terminal, images) in the tool-call result payload.

  Workspace skill projection: `acpCompatible` now projects `withSandbox` workspace skills — MCP skills are passed to the agent over ACP's native `mcpServers` (secrets/bearer headers resolved), and `gitSkill`s are linked into a harness-declared `skillsDir` (e.g. `.pi/skills`). `fileSkill`/`instructions`/`secrets` are handled by the provider-agnostic bootstrap. Exposes `workspaceMcpServers` / `projectAcpWorkspace` for adapters built on `openTransport`.

- [#774](https://github.com/TanStack/ai/pull/774) [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4) - Extract shared ACP transport, session, and AG-UI translation into `@tanstack/ai-acp`. Add WebSocket framing for in-sandbox harness servers (`grok agent serve` via `sandbox.ports.connect`). Grok Build defaults to ACP with auto stdio/WebSocket transport selection; `protocol: 'streaming-json'` keeps the legacy NDJSON path.

### Patch Changes

- Updated dependencies [[`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4), [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4), [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4), [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4), [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4)]:
  - @tanstack/ai-sandbox@0.2.0
  - @tanstack/ai@0.39.0
