---
'@tanstack/ai-sandbox': patch
---

Harness adapters now refuse a tool with `needsApproval` instead of running it without approval. The sandbox tool bridge throws a clear error when it is built with such a tool, and `executeHostTool` rejects the call.
