---
'@tanstack/ai-typesafe': minor
---

The TypeSafe evaluate adapter now sets `status` on the error it throws for an error response. `status` is the HTTP status code, so you can tell a rate limit (429) from a bad key (401) without parsing the message. The message does not change.

```ts
if (error instanceof Error && 'status' in error && error.status === 429) {
  // wait, then call decide() again
}
```
