---
'@tanstack/ai-persistence': minor
'@tanstack/ai-persistence-drizzle': minor
'@tanstack/ai-persistence-prisma': minor
'@tanstack/ai-client': minor
---

Server-authoritative reconnect is now automatic and keyed on the thread, not the run.

A chat's durable identity is its **thread**; run ids are ephemeral (a single turn
can span several runs via interrupts or tool continuations), so basing reconnect
on a client-cached run id goes stale the moment a turn rolls to a new run. This
moves the whole reconnect story onto the stable thread id, resolved by the server.

- **`RunStore.findActiveRun(threadId)`** — new optional, feature-detected store
  method returning the most recent `'running'` run for a thread (implemented for
  memory, drizzle/SQLite — which also covers Cloudflare D1 — and prisma).
- **`reconstructChat` now returns `{ messages, activeRun, interrupts }`** (was a
  bare message array): the stored transcript as UI messages, a cursor to an
  in-flight run if one exists, and any pending human-in-the-loop interrupts (tool
  approvals / waits) plus the run they paused. It reads the active run before the
  transcript so observing "no active run" guarantees the transcript is final
  (closing a finish-window race).
- **`@tanstack/ai-client` hydrates itself on mount.** In `messages: false`
  (server-authoritative) mode the client now caches no transcript and no run
  pointer: on mount `useChat`/`ChatClient` calls the connection's new
  `hydrate(threadId)` (a JSON GET against the same endpoint), paints the returned
  transcript, and — if a run is in flight — tails it via the existing `joinRun`
  durability replay. A reload and the same thread opened on another device are the
  identical, server-resolved path. No loader, no `initialMessages`, no
  `initialResumeSnapshot`, no app-side fetching required.
- **Interrupts reconstruct from the server too.** A paused approval (a tool with
  `needsApproval`) is restored from `reconstructChat`'s `interrupts` exactly as a
  persisted resume snapshot would be, so a reload — or another device — re-prompts
  the same approve/reject decision and resumes the run it paused. Previously the
  pending interrupt was only recoverable from client storage, so a fresh client
  showed the paused tool call with no way to resolve it.

Apps keep the single GET endpoint they already have (durability replay when a
resume cursor is present, else `reconstructChat`); everything else is handled by
the hook.
