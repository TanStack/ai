---
'@tanstack/ai-anthropic': patch
---

Fix `modelOptions.context_management` by attaching the required
`context-management-2025-06-27` beta. The option was typed and forwarded on the
request body, but Anthropic rejects context editing without the beta header —
so the feature typechecked and could not work (issue #1074).
