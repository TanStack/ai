---
title: Run Persistence
id: orchestration-run-persistence
order: 7
description: "How runWorkflow stores in-flight runs, why pause-and-resume needs the live generator handle, and what it takes to durable-store a paused run across process restarts."
keywords:
  - tanstack ai
  - RunStore
  - inMemoryRunStore
  - durable workflow
  - workflow persistence
  - resume across restarts
  - RunState
---

`runWorkflow` needs somewhere to keep the run while it's paused. A workflow that yields `approve()` closes the SSE; the next HTTP request has to find the right run, send the approval into the generator, and continue streaming. That "somewhere" is the **run store**.

This page covers what the store actually holds, the default in-memory implementation, and what's involved in plugging in a durable backend for long-lived approvals.

## What's in a run store

The `RunStore` interface is small:

```typescript
interface RunStore {
  get: (runId: string) => Promise<RunState | undefined>;
  set: (runId: string, state: RunState) => Promise<void>;
  delete: (runId: string, reason: DeleteReason) => Promise<void>;
}
```

`RunState` is the serializable snapshot:

```typescript
interface RunState<TInput = unknown, TState = unknown, TOutput = unknown> {
  runId: string;
  status: "running" | "paused" | "finished" | "error" | "aborted";
  workflowName: string;
  input: TInput;
  state: TState;
  output?: TOutput;
  error?: { name: string; message: string; stack?: string };
  pendingApproval?: { approvalId: string; title: string; description?: string };
  createdAt: number;
  updatedAt: number;
}
```

That's the wire format. Everything you'd need to *describe* a run without actually executing it.

## What's *not* in the wire format

The in-memory store implements a richer interface — `InMemoryRunStore` — that also keeps the **live generator handle**:

```typescript
interface InMemoryRunStore extends RunStore {
  setLive: (runId: string, live: LiveRun) => void;
  getLive: (runId: string) => LiveRun | undefined;
}

interface LiveRun {
  runState: RunState;
  generator: AsyncGenerator<StepDescriptor, unknown, unknown>;
  abortController: AbortController;
  approvalResolver?: (result: ApprovalResult) => void;
  pendingEvents: Array<StreamChunk>;
}
```

The `generator`, `abortController`, and `approvalResolver` are *not* serializable. They're JavaScript references that only exist inside the process that started the run. When the engine resumes a paused run, it calls `getLive(runId)` to find the same in-process generator and `gen.next(approval)` to deliver the approval. That's also how `stop()` works — the route handler calls `runStore.getLive(runId)?.abortController.abort()`.

This is the key constraint: **pause-and-resume requires the same Node.js process** that started the run to still be alive when the resume request arrives.

## The default: `inMemoryRunStore`

```typescript
import { inMemoryRunStore } from "@tanstack/ai-orchestration";

const runStore = inMemoryRunStore({
  ttl: 60 * 60 * 1000, // 1 hour
});
```

The TTL governs how long a `RunState` (and its live handle) survive after the last update. Each `set()` resets the timer. After the TTL expires, the entry is dropped — a resume request with that `runId` 404s.

**Use it when:**

- You're prototyping.
- Your workflows always finish in a single request (no `approve()` calls, no pauses).
- You're running a single process and don't care about losing in-flight runs on restart.

**Don't use it when:**

- You're horizontally scaled. Request 1 (start) and request 2 (resume approval) can land on different instances.
- Your runs can pause for hours or days awaiting approval — a deploy will lose them.

## Going durable: what changes, what stays

The `RunStore` interface is the easy part. Persist `RunState` to Postgres, Redis, DynamoDB — whatever fits. `set()` becomes an UPSERT, `get()` becomes a SELECT, `delete()` becomes a DELETE.

The hard part is the live generator. Today the engine assumes it can call `getLive(runId)` and find the same `AsyncGenerator` instance that yielded the approval. A durable store can't return that — generators don't serialize. So a true durable orchestrator needs one of two strategies:

1. **Sticky resume.** Persist enough state that a fresh process can recreate the in-flight run by *replaying* events. This is the event-sourcing approach: every step result is written to the store, and on resume the engine reconstructs state by replaying past results into a fresh generator until it reaches the approval, then `gen.next(approval)` continues from there.

2. **Re-route to the owning process.** Persist run state durably, but route resume requests back to the process that owns the live generator (via a session cookie, sticky load balancing, or a routing table keyed by `runId`).

The package ships **only the in-memory store today.** A community / built-in durable implementation is on the roadmap. If you need durability now, the recommended path is option 2 — pin resume requests back to the originating instance, and treat `runStore.set()` as a "what was the last-known status" log for ops/debugging rather than a true durable substrate.

> **Note:** If your orchestrator never calls `approve()` (workflows that run start-to-finish in a single request), durability isn't a concern — the run lives entirely inside one streaming response. The in-memory store is fine.

## A custom in-memory store with extra bookkeeping

If you just need to log every state transition to your observability system without changing the durability model, wrap the default store:

```typescript
import {
  inMemoryRunStore,
  type InMemoryRunStore,
} from "@tanstack/ai-orchestration";

function observableRunStore(): InMemoryRunStore {
  const inner = inMemoryRunStore({ ttl: 60 * 60 * 1000 });
  return {
    ...inner,
    async set(runId, state) {
      metrics.increment("workflow.state.set", {
        status: state.status,
        workflow: state.workflowName,
      });
      return inner.set(runId, state);
    },
    async delete(runId, reason) {
      metrics.increment("workflow.state.delete", { reason });
      return inner.delete(runId, reason);
    },
  };
}
```

Same shape, same engine semantics — just instrumented.

## Where to go next

| You want to… | Read |
|---|---|
| Add the approval primitive before worrying about durability | [Approvals](./approvals) |
| Add OpenTelemetry spans around workflow runs | [OpenTelemetry](../advanced/otel) |
| Look up `inMemoryRunStore` / `RunState` types | [API reference](../api/ai-orchestration) |
