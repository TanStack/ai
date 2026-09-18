---
'@tanstack/ai': minor
'@tanstack/ai-typesafe': minor
'@tanstack/ai-openrouter': patch
'@tanstack/ai-vercel-gateway': patch
'@tanstack/ai-cloudflare': patch
---

Add evaluator() and TypeSafe Jev evaluate adapters.

Callers build a client with evaluator({ adapter }) and then await decide({ state, questions }).
Questions use choice(), score(), and boolean(). Answers sit on the result (value, probability, confidence). Usage sits on result.meta.

Jev transports:

- @tanstack/ai-typesafe (typesafeEvaluator)
- @tanstack/ai-openrouter (openRouterEvaluator)
- @tanstack/ai-vercel-gateway (vercelGatewayEvaluator)
- @tanstack/ai-cloudflare (cloudflareEvaluator)
