---
'@tanstack/ai-typesafe': minor
'@tanstack/ai-ollaya': minor
'@tanstack/ai-openrouter': minor
'@tanstack/ai-vercel-gateway': minor
---

The TypeSafe, Ollaya, OpenRouter and Vercel Gateway evaluate adapters now set `status` on the error they throw for an error response. `status` is the HTTP status code, so you can tell a rate limit (429) from a bad key (401) without parsing the message. The message does not change.

```ts
if (error instanceof Error && 'status' in error && error.status === 429) {
  // wait, then call decide() again
}
```
