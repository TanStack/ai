---
'@tanstack/ai-react': minor
'@tanstack/ai-preact': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-svelte': minor
'@tanstack/ai-client': minor
---

The chat hooks no longer take an `id` option — a hook's identity is its `threadId`.

`useChat` / `createChat` previously accepted a separate `id` that keyed client
persistence and named the devtools instance, defaulting to a framework
`useId()` when omitted. That meant persistence keyed on an ephemeral render-tree
id even when you passed a stable `threadId`, so a reload found nothing under the
thread's key.

Now the `threadId` is the single identity:

- The hooks drop the `id` option. Pass `threadId` to persist a conversation and
  restore it on reload; omit it for an ephemeral chat.
- Persistence keys on `threadId` (unchanged in `ChatClient`, which already
  resolved `id ?? threadId` — the hooks simply stop overriding it).
- `ChatClient.uniqueId` (the devtools instance id) now falls back to `threadId`
  instead of a generated id, so a thread shows up in devtools under its own id.
- Changing `threadId` on a mounted `useChat` (react/preact/solid) now recreates
  the client so the new thread takes effect; previously the change was ignored.

`ChatClient` still accepts `id` directly as a lower-level escape hatch for
keying storage separately from the wire thread; only the framework hooks drop it.

Migration: replace `useChat({ id })` with `useChat({ threadId })`.
