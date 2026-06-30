---
'@tanstack/ai-acp': minor
---

Add `acpCompatible` / `acpCompatibleText` — the harness equivalent of `openaiCompatible`. Build a `chat()` text adapter for any ACP-compliant agent CLI and plug it into a sandbox without a dedicated adapter package: configure `command` (stdio) or `openTransport` (WebSocket/custom) once, then select a model per call. Handles sandbox resolution, tool→MCP bridging, session resume, permission modes (`headless` / `interactive`), abort, and AG-UI translation. Also exports the shared `buildAcpPrompt` helper.
