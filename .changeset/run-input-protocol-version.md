---
'@tanstack/ai': patch
'@tanstack/ai-client': patch
---

Connection adapters now send the AG-UI `protocolVersion` (`"1.0"`) in the `RunAgentInput` request body, as the AG-UI spec asks. `@tanstack/ai/client` re-exports `PROTOCOL_VERSION`.
