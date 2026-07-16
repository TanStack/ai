---
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-svelte': minor
'@tanstack/ai-preact': minor
'@tanstack/ai-angular': minor
---

Messages sent while a stream is already in flight are now queued by default and automatically sent once the in-flight stream settles, instead of being silently dropped. **This is a behavior change.** Restore the previous drop-while-busy behavior with `queue: 'drop'`.

The behavior is configurable via a new `queue` option, which accepts `whenBusy: 'queue' | 'drop' | 'interrupt'`, `drain: 'fifo' | 'batch'`, `maxSize`, and `onOverflow`, or a custom strategy function for full control.

Queued messages are exposed on the hook as `queue` and can be cancelled before they send via `cancelQueued(id)`. `sendMessage` also accepts a per-call `{ whenBusy }` override.
