---
'@tanstack/ai-acp': minor
---

Add `acpCompatible` / `acpCompatibleText` — the harness equivalent of `openaiCompatible`. Build a `chat()` text adapter for any ACP-compliant agent CLI and plug it into a sandbox without a dedicated adapter package: configure `command` (stdio) or `openTransport` (WebSocket/custom) once, then select a model per call. Handles sandbox resolution, tool→MCP bridging, session resume, permission modes (`headless` / `interactive`), abort, and AG-UI translation. Also exports the shared `buildAcpPrompt` helper.

Typed configuration (parity with `openaiCompatible`): declare `models` for a type-safe model union, and a `modelOptions` brand (`{} as { … }`) for the per-call options accepted via `chat({ modelOptions })`. Declared options are merged with the base ACP options and exposed on `ctx.modelOptions` in `command` / `openTransport` so they can become CLI flags.

ACP client compliance: the `initialize` handshake now sends `clientInfo` and validates the negotiated protocol version. The stream translator surfaces non-text agent content (image/audio/resource blocks) as a `CUSTOM` event (via the new optional `contentEvent` translate label; `acpCompatible` enables it as `<name>.message-content`) instead of dropping it, and preserves non-text tool content (diffs, terminal, images) in the tool-call result payload.
