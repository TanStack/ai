---
'@tanstack/ai': patch
'@tanstack/ai-sandbox': minor
---

fix(sandbox): a durable sandboxed run survives losing its viewer instead of being killed by it

A client disconnect could only reach `withSandbox` if the application mirrored
`request.signal` into `chat()`'s `abortController` — which aborts the run.
`chat()` then returned at its cancellation check immediately after middleware
`setup`, so the harness adapter's `chatStream` was never called and the agent in
the sandbox that `setup` had just spent minutes building was **never launched**.
Switching away while the UI still said "starting the sandbox" left an empty log
for a run that did nothing — unrecoverable even by takeover, because an agent
that never started writes no journal to replay. Applications had to choose
between "the middleware learns about the disconnect" and "the run survives it".

A disconnect is now delivered as a notification rather than a cancellation: the
durable transport tells the run its response body was cancelled, without aborting
it. `withSandbox` records `detachedSince`/`sandboxKey` and publishes the detach
verdict, and the run keeps draining into its still-open delivery log for a
rejoining client to tail. Teardown stays where it belongs — the file watcher is
not stopped and the sandbox is not destroyed while the run is still using them.

A genuine stop is unchanged: it arrives out of band (`RunRecord.cancelRequested`
/ `RUN_CANCEL_REASON`), and aborting an `abortController` you pass still
terminalizes the run.

A third thing was missing in that window, and core now owns it: the delivery log was
empty, so every joiner's fast-fail (`memoryStream`'s first-chunk deadline, the
client's 2s rejoin connect deadline) read a live run as gone. `RUN_ACCEPTED_EVENT`
covers it for every durable run, so `withSandbox` deliberately appends no marker of
its own — a second one would only land mid-stream in a run already producing.

Two related fixes, both found while verifying the above:

- `withSandbox` registered its run state only _after_ `definition.ensure()`, so a
  disconnect during the minutes-wide sandbox creation — the likeliest moment for
  one — was a silent no-op. State is now registered before `ensure`.
- A durable run was invisible for the whole of `ensure`. Chat persistence creates
  the run record from `onConfig`, which runs after every middleware `setup`, so
  during the minutes a sandbox takes to build there was no record at all:
  `findActiveRun` reported nothing running for a run that was demonstrably
  starting (measured: a status sidebar showed `idle` for 6.5 minutes), a client
  returning to the thread had nothing to tell it a run was in flight and rendered
  an empty pane, a crash in that window left nothing for `listReclaimable` to
  surface, and the detach stamp silently no-opped because `RunStore.update` does
  nothing for an unknown runId. `withSandbox.setup` now pre-creates the record
  before `ensure` for durable runs only; `createOrResume` is idempotent, so
  persistence's own later call simply finds it.

`withSandbox` also records the harness's own tool calls into the transcript, so a
FINISHED run restores its tool cards instead of only its verdict. A harness executes
its tools inside the sandbox, so `chat()` merely relays their `TOOL_CALL_*` chunks —
it never wrote an assistant message for them, and chat persistence stores
`ctx.messages`. The tool history therefore existed only in the run's delivery log:
switching away and coming back replayed all of it (there was a live run to rejoin),
while a reload after the run finished hydrated from the message store and got the
prompt plus the final text and nothing else (measured: 487,443 characters of
transcript before the reload, 4,014 after). They are recorded as ordinary `toolCalls`
plus `role: 'tool'` messages, which needs no new wire format and no client change —
`modelMessagesToUIMessages` already merges a stored result into the call it belongs to
and completes the card.

Each recorded call carries `metadata.sandboxObserved`, which does two jobs. It is
stripped from the request to the model on the next turn — those calls name tools the
provider was never given, and one run of them is far too many tokens to replay — and
it lets an app's own `MessageStore` find them in `saveThread` to cap or drop what it
does not want to keep. Nothing is truncated for you; results are handed over whole.
See `docs/sandbox/events.md`.

One public addition, `isSandboxToolCall(toolCall)` from `@tanstack/ai-sandbox`: true
when a tool call was executed by the harness inside the sandbox and recorded for
display. It reads the marker so an app never has to know the metadata key, and it also
accepts a rendered `tool-call` part, whose `metadata` is copied from the message — so
the same helper filters a client-side view. Everything else is internal: the disconnect
seam is exposed only through `@tanstack/ai/adapter-internals` for
`@tanstack/ai-sandbox`, and the recorder itself is private to `withSandbox`.
