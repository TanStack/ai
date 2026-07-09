---
'@tanstack/ai-sandbox-vercel': patch
---

Sandbox API requests now append a `@tanstack/ai` token to the `user-agent` so the Vercel sandbox control plane can attribute traffic to the TanStack AI framework.
