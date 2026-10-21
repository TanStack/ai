---
title: Durable Runs
id: sandbox-durable-runs
order: 11
description: "Let a sandboxed agent run continue after a page refresh or a closed tab. Turn durable runs on, then learn how detach, the journal, takeover, and the reaper fit together."
keywords:
  - durable runs
  - detach on disconnect
  - agent survives refresh
  - resume agent run
  - sandbox billing
---

Your coding agent can take ten minutes to finish a task. In that time the user refreshes, closes the laptop, or loses wifi. By default, a dropped connection destroys the sandbox, and the work is lost.

Durable runs keep the agent working when the user leaves. When the user comes back, the stream continues from where they left off.

## Turn it on

1. Pass both `runs` and `durability` to `withSandbox`, and pass a `runId`. With only one of the two options, you get the default: destroy on disconnect, with no warning.

```ts
import {
  chat,
  chatParamsFromRequest,
  memoryStream,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { InMemoryLockStore, withLocks } from '@tanstack/ai/locks'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { memoryPersistence, withPersistence } from '@tanstack/ai-persistence'
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
  githubRepo,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

// Local dev only. In production, use durable stores and a distributed lock.
const persistence = memoryPersistence()
const locks = new InMemoryLockStore()

const sandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/app' }),
    setup: [
      'npm install -g @anthropic-ai/claude-code --include=optional && claude --version',
    ],
    secrets: createSecrets({
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
    }),
  }),
})

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)
  // ONE adapter for the middleware and the response, so the journal and the
  // delivery log describe the same run.
  const adapter = memoryStream(request)

  const stream = chat({
    adapter: claudeCodeText('claude-opus-4-8'),
    messages,
    threadId,
    // Required: the journal path and the log name both come from it.
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

2. Add a `GET` route that replays the log and takes over the run when a client comes back. See [Takeover & Detached Runs](./takeover).
3. Schedule the sweeper: a cron route, a queue consumer, a Durable Object `alarm()`, or what your platform has. See [Reaping & Retention](./reaping).
4. Use a real distributed lock in production. The in-memory `LockStore` cannot coordinate across hosts, so two servers can race. `withSandbox` warns when it sees that setup.

> [!WARNING]
> Do not skip step 3. With no sweeper, sandboxes bill forever, and disconnected readers wait forever on logs that nothing closes. Nothing warns you.

Now a refresh does not kill the run. The client reconnects, and the stream continues.

## How it works

Durable runs tell two cases apart: the user pressed **Stop**, or the user only left. Four pieces handle the second case.

1. **A disconnect detaches.** The agent keeps working, the sandbox stays up, and the run record notes "nobody watches this since 3:42pm".
2. **The agent writes its output to a file.** If the agent writes straight to the browser, the output is lost when the browser leaves. A file inside the sandbox is still there when someone comes back. That file is the [journal](./journal).
3. **A returning client picks up mid-sentence.** A new request, maybe on a different server, reads the file. It finds how much the user already saw and streams only the rest. That is [takeover](./takeover).
4. **A sweeper cleans up after users who never come back.** It finds abandoned runs, checks if the agent finished, and then wraps them up or shuts them down. That is the [reaper](./reaping).

## Advanced

### Why the default destroys the sandbox

When you close the pipe to an agent in a sandbox, the agent does not stop. It keeps working and keeps spending tokens. So destroying the sandbox is the only sure way to stop a disconnected job from spending money.

That is correct when the user pressed Stop. It is wrong when the user only refreshed the page. Durable runs exist for that second case.

### Two replicas never drive one run

A user can open the same thread in two tabs, or a load balancer can send a retry to another server. Then two servers try to continue one run, and the user sees doubled text and two "finished" messages.

So a server must take a numbered ticket to drive a run. When a newer server takes a higher number, the older one is locked out. It cannot append to the log or mark the run finished.

### The agent cannot fake "finished"

A run ends when a special line appears at the end of the journal file. But the agent writes that file, and an agent writes whatever the model says.

If a model prints that line, the reaper thinks that a running job ended, and it shuts down a live sandbox. So the line includes a value that is computed from the run's own id. A model cannot print it by accident, so a stray line cannot get the sandbox destroyed.

### Two pipes can break

A run's output crosses two pipes on its way to the user:

```
agent (in sandbox) --[capture]--> server host --[delivery]--> client
                                       |
                                       '--> durable delivery log
```

- **Delivery** (host to client) breaks when the browser refreshes or the connection drops. The delivery log fixes this. The host appends every chunk, and a returning client reads the log from where it stopped. That is [resumable streams](../resumable-streams/overview).
- **Capture** (agent to host) breaks when the host dies during a run. The agent keeps writing into a pipe with no reader. The delivery log cannot help, because the break is before the log's writer. The [journal](./journal) fixes this: the agent writes to a file in the sandbox, so the bytes and their storage live and die together.

Why a file, and not the delivery log? The agent cannot speak the protocol. It is a third-party CLI that prints raw text. The chunks, offsets, and cursors of the log exist only after the host translates that output.

To write the log from the sandbox, you must ship these into the container:

- A translator.
- A network client.
- Credentials.

That gives a model-driven process write access to what clients see, and it skips the numbered-ticket fencing above. A file needs none of that. The agent can damage only its own output, and the host makes sure of that output when it reads it back.

Normal persistence is neither pipe. The message store holds the finished conversation, written after the run. It restores thread history across runs, not a run in progress.

### The two tiers

Everything above is one protocol with two deployment tiers. The only difference is where the durable copy of the output lives.

- **Journal-only** is the default. It needs no extra infrastructure. The only durable copy is the journal file in the sandbox, so the output lives as long as the sandbox. While the sandbox is up, any host can rebuild the whole run from the file. This is what you get from the setup above.
- **Log-first** adds a durable delivery log outside the sandbox, and every chunk goes to both. Clients read only the log, so a reconnect never touches the sandbox. The journal stays, for driver recovery: warm reattach, and finding where a resuming driver continues the run.

When both copies exist, one rule decides: **the log wins for what clients see, and the journal wins for where the driver resumes.** Alignment does exactly this. It treats the stored log as already delivered, and uses the journal replay only to find the position to append from.

Cloudflare is the log-first tier with Durable Object implementations. A Durable Object owns the run and keeps its event log, and clients read from it. See [Cloudflare (Edge)](./cloudflare). Know the cost before you choose it: log-first writes every chunk twice (journal and log). That is why journal-only is the default.

### Related pages

- [The Run Journal](./journal): the file, and why it is a file.
- [Takeover & Detached Runs](./takeover): the wiring for both routes.
- [Reaping & Retention](./reaping): the sweeper, and how to schedule it.
- [Instance Durability](./durability): find the same sandbox from other servers. That is a separate concern from keeping its output readable.
