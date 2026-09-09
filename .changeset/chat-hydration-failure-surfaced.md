---
'@tanstack/ai-client': patch
---

Surface mount-hydration failures with `persistence: true`. When the server-driven
thread load (`connection.hydrate`) threw — a 500, a dropped connection, an
authorize-gate rejection — `ChatClient` swallowed it in a bare `catch { return }`:
`onError` never fired, `error` stayed `undefined`, and `status` stayed `ready`
with zero messages, indistinguishable from a genuinely empty thread. It now runs
a `failHydration` path mirroring `GenerationClient`: `status: 'error'`, `error`
set, and `onError` called, so an app can tell "failed to load" from "no messages"
and offer a retry. A `ByokMissingError` / locked `ByokBlockedError` raised during
hydrate also triggers the key-request flow, matching the send path. A genuine
miss (server has no record for a fresh thread) stays silent, and a failure that
lands after the view detached or a send took over is ignored.
