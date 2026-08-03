---
'@tanstack/ai-client': minor
'@tanstack/ai-react': patch
'@tanstack/ai-preact': patch
'@tanstack/ai-svelte': patch
'@tanstack/ai-solid': patch
'@tanstack/ai-vue': patch
'@tanstack/ai-angular': patch
---

feat(ai-client): only the chat on screen holds a stream — `attach()` / `detach()`

**Behavior change for direct `ChatClient` users.** Tailing no longer starts in the
constructor. If you construct `ChatClient` yourself, call `client.attach()` when your
view appears and `client.detach()` when it goes. Every framework package in this repo
does it for you, so `useChat` (React, Vue, Solid, Svelte, Preact) and `injectChat`
(Angular) users need no change.

Why it had to move out of the constructor: a UI framework may build a client and then
throw it away — React does on a double-invoked render. A discarded client is never
mounted, so nothing ever calls `detach()` or `dispose()` on it, and a connection its
constructor had opened could never be closed. Traced with CDP: connection ids
1374/1396/1428/1437 were still held after eight thread switches, and a later request
waited 210 SECONDS for a free slot (`stallMs: 210752`). No guard inside the client can
fix that, because every guard runs on the instance the framework KEPT — the leak is in
the instance it discarded. Only "idle until a view attaches" makes a thrown-away
client harmless.

A page can own many chats. Forty sandbox runs, or forty conversations, is a normal
shape for this SDK. A browser allows only about six connections per origin, and
each tailed run holds one for as long as the run lasts. So a handful of views is
enough to consume every slot, and then every other request QUEUES: measured in the
sandbox example, a fetch issued from the page took **93 seconds**, while the exact
same request from outside the browser took **17 milliseconds**. The visible effects
were a message vanishing from the transcript, no UI updates until a run finished,
and a page reload that took 40 seconds.

Tailing used to begin only in the `ChatClient` constructor, so a view could never
stop tailing and later resume — unmount had to either keep the connection open or
lose the run for good. Keeping it open is what starved the page.

`ChatClient` now has a lifecycle pair:

- **`attach()`** — start tailing (rejoin an in-flight run, hydrate if
  server-authoritative). Idempotent, so a wrapper's mount after construction is free.
- **`detach()`** — drop the connection and keep everything else: transcript, resume
  pointer and run id all survive, so re-entering the view repaints instantly and
  re-tails from the durable log.

`detach()` is deliberately neither `stop()` (which means the user ended the run) nor
`dispose()` (which means the client is finished). It says only that nobody is
watching right now.

**Costs nothing for a chat that is not persisted.** Both actions in `attach()` are
gated: the rejoin needs a persisted run pointer, and the hydration needs
server-authoritative mode. An ephemeral chat issues no request when its view mounts
or re-mounts.

The React, Preact and Svelte wrappers now release the connection the moment their
view unmounts. They previously deferred teardown through a timer that a re-mount
could cancel — correct for disposal, useless for a connection. Svelte had no
automatic cleanup at all and required the app to call `stop()` by hand.

Solid, Vue and Angular already dropped the connection immediately on unmount; they
now also `attach()` on mount, because the constructor no longer does. The generation
and video hooks already revived on mount through `mountDevtools()` and disposed
immediately on unmount, so those are unchanged.

Also fixed: a hydration request that resolved AFTER its view was disposed went on to
open a tail on a dead client, which nothing could ever abort — one leaked connection
per thread switch.
