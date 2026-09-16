---
'@tanstack/ai-bedrock': patch
---

Use the Bedrock API compatibility config's `mantlePath` on the Mantle endpoint so Gemma 4 hits `/openai/v1` instead of a misleading 401. Other models stay on `/v1`.
