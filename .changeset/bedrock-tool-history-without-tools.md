---
'@tanstack/ai-bedrock': patch
---

The Bedrock Converse adapter now sends tool history as text when a chat request has no tools. Bedrock needs a `toolConfig` for `toolUse` and `toolResult` blocks, so before this fix such a request failed with a 400 error. The saved messages do not change.
