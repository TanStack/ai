---
title: Durable Runs
id: sandbox-durable-runs
order: 11
description: "Turn durable sandbox runs on, then understand them: why a run needs to survive a page refresh, and how detach, the journal, takeover and the reaper fit together."
keywords:
  - durable runs
  - detach on disconnect
  - agent survives refresh
  - resume agent run
  - sandbox billing
---

# Durable Runs Explained

Turn it on with the snippet below. The rest of the page is the mental model, in plain
language, and it is worth reading before [The Run Journal](./journal),
[Takeover & Detached Runs](./takeover) and [Reaping & Retention](./reaping), which go
deeper into each piece.

## Turn it on

Two options on `withSandbox` and you have durable runs. Passing only one of them
leaves you with the default destroy-on-disconnect behavior, silently, because you have
not asked for durability:

```ts
import {
  chat,
  chatParamsFromRequest,
  memoryStream,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { withLocks } from '@tanstack/ai/locks'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { withPersistence } from '@tanstack/ai-persistence'
import { withSandbox } from '@tanstack/ai-sandbox'
// Your stores, your `defineSandbox(...)` result, your distributed LockStore.
import { locks } from './locks'
import { persistence } from './persistence'
import { sandbox } from './sandbox'

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)
  // ONE adapter, handed to both the middleware and the response, so the journal
  // and the delivery log describe the same run.
  const adapter = memoryStream(request)

  const stream = chat({
    adapter: claudeCodeText('claude-opus-4-8'),
    messages,
    threadId,
    // Required: the journal path and the log name are both derived from it.
    runId,
    middleware: [
      withPersistence(persistence),
      withLocks(locks),
      withSandbox(sandbox, {
        runs: persistence.stores.runs,
        durability: { adapter },
      }),
    ],
  })

  return toServerSentEventsResponse(stream, { durability: { adapter } })
}
```

That is the producing half. A returning client needs a `GET` that replays the log and
adopts the run, which is [Takeover & Detached Runs](./takeover).

Then two things people forget, both of which look fine until they are not:

1. **Schedule the sweeper.** A cron route, a queue consumer, a Durable Object
   `alarm()`, whatever your platform gives you. Skip it and sandboxes bill
   indefinitely while disconnected readers wait forever on logs nothing will close.
   Nothing warns you. See [Reaping & Retention](./reaping).
2. **Use a real distributed lock.** The in-memory `LockStore` cannot coordinate across
   hosts, so it cannot stop two replicas racing. `withSandbox` warns when it sees that
   combination.

The rest of this page is why it works that way, and what it costs.

## The problem

You are building something like ChatGPT, except the assistant is a coding agent
that works inside a sandbox and can take ten minutes to finish a task.

Ten minutes is a long time for a browser tab. The user refreshes. Closes the
laptop. Loses wifi. Or their next request lands on a different replica than the
one running the job.

## What happens without durability

The connection dropping kills everything. The sandbox is destroyed, the work is
thrown away, and the user comes back to nothing.

That is not a bug. It is the least-bad option available by default. When you
close the pipe to an agent running in a sandbox, **the agent does not stop.** It
keeps working and keeps spending money on tokens. So destroying the sandbox is
the only reliable way to be sure a disconnected job stops burning cash.

Which is exactly right if the user pressed **Stop**. And completely wrong if
they just refreshed the page.

## What durability changes

Durable runs teach the system to tell those two situations apart, and to handle
the refresh case properly. Four pieces:

### 1. A disconnect no longer kills anything

It **detaches**: the agent keeps working, the sandbox stays up, and the run
record notes _"nobody is watching this, as of 3:42pm."_

### 2. The agent writes its output to a file instead of down the wire

This is the key trick. If the agent talks directly to the browser, its words
vanish the moment the browser leaves. If it writes to a file inside the sandbox,
the words are still sitting there when someone comes back. That file is the
[journal](./journal).

### 3. Someone comes back, and we pick up mid-sentence

A new request, possibly on a different replica, reads that file, works out how
much the user already saw, and streams only the part they missed. No repeated
paragraphs, no gaps. That is [takeover](./takeover).

### 4. Something has to clean up after the people who never come back

Otherwise a sandbox runs forever on a job nobody will ever read. So there is a
sweeper: it finds abandoned runs, checks whether the agent finished on its own,
and either wraps them up or shuts them down. That is the
[reaper](./reaping).

## The two parts that sound over-engineered but are not

### Making sure two replicas never both drive one run

If a user opens the same thread in two tabs, or a load balancer sends a retry
elsewhere, two replicas could both try to continue one run, and the user would
see doubled text and contradictory "finished" messages.

So a replica has to take a numbered ticket to drive a run. If a newer replica
takes a higher number, the older one is locked out of writing anything at all,
not merely discouraged, but unable to append to the log or mark the run
finished.

### Making "the agent finished" impossible to fake

The way we know a run ended is that a special line appears at the end of the
journal file. But the _agent itself_ writes that file, and agents write whatever
the model says.

If a model happened to print that line, the reaper would believe a running job
had ended and would shut down a live sandbox. So the line includes a secret
value derived from the run's own id. The agent cannot produce it, so it cannot
get its own sandbox destroyed.

## Two pipes can break, and they need different fixes

A run's output crosses two pipes on its way to the user, and everything on
this page is a fix for one of them breaking:

```
agent (in sandbox) ──[capture]──▶ server host ──[delivery]──▶ client
                                       │
                                       └──▶ durable delivery log
```

**Delivery** (host → client) breaks when the browser refreshes or the
connection drops. The delivery log fixes it: the host appends every chunk as
it pumps, and a returning client tails the log from where it left off. That is
[resumable streams](../resumable-streams/overview), and it is complete for
this half.

**Capture** (agent → host) breaks when the _host_ dies mid-run. The agent
keeps emitting, into a pipe whose other end is gone, and no durability on
the delivery log helps, because the problem is upstream of the log's writer.
The [journal](./journal) fixes it by moving the write inside the sandbox: the
agent writes to a file, so the producer of the bytes and their storage share
fate, and there is no host in that path to die.

The obvious question is why the capture fix is a file rather than pointing the
agent at the same durable log, and the answer starts with: **the agent cannot
speak the protocol.** It is somebody else's CLI printing raw text; the chunks,
offsets, and cursors in the delivery log only exist after the host translates
that output. Teaching the sandbox to write the log would mean shipping a
translator, a network client, and credentials into the container, and the log
is what clients render, so that hands a model-driven process write access to
client-facing truth and bypasses the numbered-ticket fencing above (the same
concern that makes the exit sentinel unforgeable). A file needs none of it: no
network, no credentials, nothing the agent can corrupt but its own output,
which the host verifies on the way back out anyway.

Normal persistence is neither pipe: the message store holds the _finalized_
conversation, written after the fact, and it restores thread history across
runs, not a run in flight.

## The two tiers

Everything above is **one protocol with two deployment tiers**, and the only
difference between them is where the durable copy of the output lives.

**Journal-only** is the zero-infrastructure default. The only durable copy of
the run's output is the journal file inside the sandbox, so the log's
durability equals the sandbox's lifetime: as long as the sandbox is up, any
host can reconstruct the whole run from the file. You deploy nothing extra,
this is what you get from the wiring pages as written.

**Log-first** adds a durable delivery log _outside_ the sandbox, and every
chunk is written to both. Clients only ever tail the log; a reconnect never
touches the sandbox at all. The journal does not go away. It is demoted to
driver recovery: warm reattach, and working out where a resuming driver picks
the run back up.

When both copies exist, precedence is one sentence: **the log wins for what
clients see; the journal wins for where the driver resumes.** That is exactly
what alignment implements: the stored log is treated as already-delivered
truth, and the journal replay is only used to derive the position to append
from.

Cloudflare is the log-first tier with Durable-Object-backed implementations (a DO
owns the run and persists its event log, and clients tail the DO), not a parallel
architecture. See [Cloudflare (Edge)](./cloudflare). The cost worth
knowing before choosing it: log-first double-writes every chunk (journal +
log), which is why journal-only stays the default.

## See also

- [The Run Journal](./journal): the file, and why it is a file
- [Takeover & Detached Runs](./takeover): the wiring, both routes
- [Reaping & Retention](./reaping): the sweeper, and how to schedule it
- [Instance Durability](./durability): keeping the _sandbox_ findable across
  replicas, which is a separate concern from keeping its _output_ readable
