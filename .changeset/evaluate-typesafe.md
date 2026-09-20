---
'@tanstack/ai': minor
'@tanstack/ai-typesafe': minor
'@tanstack/ai-openrouter': patch
'@tanstack/ai-vercel-gateway': patch
'@tanstack/ai-cloudflare': patch
---

Add decide() and TypeSafe Jev evaluate adapters.

Callers await one decide({ adapter, state, questions }) call.
Questions use choice(), score(), and boolean(). Answers sit on the result (value, probability, confidence). Usage sits on result.meta.

Jev transports:

- @tanstack/ai-typesafe (typesafeDecider)
- @tanstack/ai-openrouter (openRouterDecider)
- @tanstack/ai-vercel-gateway (vercelGatewayDecider)
- @tanstack/ai-cloudflare (cloudflareDecider)
