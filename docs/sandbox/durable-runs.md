---
title: Durable Runs
id: sandbox-durable-runs
order: 11
description: "Turn on durable sandbox runs so refresh/disconnect detaches instead of destroying work."
keywords:
  - durable runs
  - detach on disconnect
  - agent survives refresh
  - resume agent run
  - sandbox billing
---

# Durable Runs

If a coding agent can take minutes and users refresh or hit another replica → turn on durable runs.

## Turn it on

**Must (both):** `runs` + `durability` on `withSandbox`. One alone = silent destroy-on-disconnect.

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
import { locks } from './locks'
import { persistence } from './persistence'
import { sandbox } from './sandbox'

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)
  const adapter = memoryStream(request)

  const stream = chat({
    adapter: claudeCodeText('claude-opus-4-8'),
    messages,
    threadId,
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

Producing half only. Returning client → [Takeover](./takeover).

### Two things people skip

1. **Schedule the reaper.** No cron/`alarm()` → sandboxes bill forever; logs stay open. → [Reaping](./reaping).
2. **Distributed lock.** In-memory cannot fence two replicas. `withSandbox` warns.

## Problem

Without durability: disconnect destroys the sandbox (only reliable stop — agent keeps spending after the pipe closes). Correct for Stop; wrong for refresh.

## What durability adds

1. **Disconnect detaches** — agent keeps working; record notes no viewer.
2. **Agent writes a [journal](./journal)** — output survives host death.
3. **Takeover** — later request (maybe other host) streams only the missed part.
4. **[Reaper](./reaping)** — cleans runs nobody returns for.

## Two safety requirements

| Need | Mechanism |
| --- | --- |
| One writer per run | Lease + `driverEpoch` fencing |
| Unforgeable “agent finished” | Exit sentinel with run-derived `__nonce` |

## Two pipes

```
agent (sandbox) ──[capture]──▶ server ──[delivery]──▶ client
                                  └──▶ durable delivery log
```

| Pipe | Breaks when | Fix |
| --- | --- | --- |
| Delivery (host→client) | Browser refresh | [Resumable streams](../resumable-streams/overview) log |
| Capture (agent→host) | Host dies | [Journal](./journal) file inside sandbox |

Journal is a file (not the delivery log) because the agent is a third-party CLI — no protocol client/credentials in the sandbox; model-driven write access to client-facing log would bypass fencing.

## Two tiers

| Tier | Durable output | When |
| --- | --- | --- |
| **Journal-only** (default) | File in sandbox | Zero extra infra; durability = sandbox lifetime |
| **Log-first** | Delivery log outside + journal for driver recovery | Clients never touch sandbox; double-write cost |

**Precedence:** log wins for clients; journal wins for driver resume.

Cloudflare is log-first with DO-backed logs → [Cloudflare](./cloudflare).

## See also

- [Journal](./journal) · [Takeover](./takeover) · [Reaping](./reaping)
- [Instance durability](./durability) — find the sandbox, not its output
