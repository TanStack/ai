---
'@tanstack/ai-vercel-gateway': patch
---

Aborting `generateImage()` now stops the Vercel AI Gateway request. Before, the call rejected but the request kept running and was billed.
