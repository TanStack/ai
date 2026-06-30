---
'@tanstack/ai-acp': minor
'@tanstack/ai-grok-build': minor
---

Extract shared ACP transport, session, and AG-UI translation into `@tanstack/ai-acp`. Add WebSocket framing for in-sandbox harness servers (`grok agent serve` via `sandbox.ports.connect`). Grok Build defaults to ACP with auto stdio/WebSocket transport selection; `protocol: 'streaming-json'` keeps the legacy NDJSON path.
