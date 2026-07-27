---
'@tanstack/ai': minor
---

Add `defineLock` to `@tanstack/ai/locks`: an identity typer for a `LockStore`
implementation, matching the `define*Store` helpers in `@tanstack/ai-persistence`.
Pass a `withLock` object and get autocomplete and contract checking inline, with
no `: LockStore` annotation, then hand it to `withLocks`.

```ts
import { defineLock, withLocks } from '@tanstack/ai/locks'

const locks = defineLock({
  async withLock(key, fn) {
    const { release, signal } = await acquire(key)
    try {
      return await fn(signal)
    } finally {
      release()
    }
  },
})

const middleware = [withLocks(locks)]
```
