---
'@tanstack/ai-bedrock': patch
---

Use `/openai/v1` on the Bedrock Mantle endpoint for `google.gemma-4-*` models so chat and responses requests hit the path AWS serves instead of a misleading 401. Gemma 3 stays on `/v1`.
