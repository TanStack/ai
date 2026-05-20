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

The `RunStore` interface has two halves — a `RunState` snapshot and an append-only step log used by the engine's replay path:

```typescript
interface RunStore {
  // State snapshot
  getRunState: (runId: string) => Promise<RunState | undefined>;
  setRunState: (runId: string, state: RunState) => Promise<void>;
  deleteRun: (runId: string, reason: DeleteReason) => Promise<void>;

  // Append-only step log (CAS)
  appendStep: (
    runId: string,
    expectedNextIndex: number,
    record: StepRecord,
  ) => Promise<void>;
  getSteps: (runId: string) => Promise<ReadonlyArray<StepRecord>>;
}
```

`appendStep` is contractually atomic — it throws `LogConflictError` if another writer has already committed at `expectedNextIndex`. The engine uses this to distinguish idempotent retries (same `signalId`) from lost races (different `signalId`).

`RunState` is the serializable snapshot:

```typescript
interface RunState<TInput = unknown, TState = unknown, TOutput = unknown> {
  runId: string;
  status: "running" | "paused" | "finished" | "error" | "aborted";
  workflowName: string;
  workflowVersion?: string;
  fingerprint?: string;
  startingPatches?: ReadonlyArray<string>;
  input: TInput;
  state: TState;
  output?: TOutput;
  error?: { name: string; message: string; stack?: string };
  pendingApproval?: { approvalId: string; title: string; description?: string };
  waitingFor?: {
    signalName: string;
    deadline?: number;
    meta?: Record<string, unknown>;
  };
  createdAt: number;
  updatedAt: number;
}
```

That's the wire format. Everything a host needs to *describe* a run without actually executing it. `fingerprint`, `workflowVersion`, and `startingPatches` are load-bearing for resume — the engine uses them on every replay to verify the deployed workflow's source hasn't drifted since the run started.

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
  pendingApprovalStepId?: string;
}
```

The `generator`, `abortController`, and `approvalResolver` are *not* serializable. They're JavaScript references that only exist inside the process that started the run. When the engine resumes a paused run on the same node, it calls `getLive(runId)` to find the same in-process generator and `gen.next(approval)` to deliver the approval — the fast path. That's also how `stop()` works — the route handler calls `runStore.getLive(runId)?.abortController.abort()`.

When the live handle is *not* available (different process after a restart or horizontal scale), the engine takes the **replay-from-log** path: it reconstructs the run by replaying every `StepRecord` from `getSteps(runId)` into a fresh generator until it reaches the pause point, then resumes from there. The fingerprint check guards against replaying into code that has drifted from the original source.

## The default: `inMemoryRunStore`

```typescript
import { inMemoryRunStore } from "@tanstack/ai-orchestration";

const runStore = inMemoryRunStore({
  ttl: 60 * 60 * 1000, // 1 hour
});
```

The TTL governs how long a `RunState` (and its live handle and step log) survive after the last update. Each `setRunState` / `appendStep` resets the timer. After the TTL expires, the entry is dropped — a resume request with that `runId` 404s.

> **Note:** A run that pauses longer than the TTL with no intermediate engine activity will silently be deleted. For long-lived approvals or sleeps, raise `ttl` or use a durable store implementation.

**Use it when:**

- You're prototyping.
- Your workflows always finish in a single request (no `approve()` calls, no pauses).
- You're running a single process and don't care about losing in-flight runs on restart.

**Don't use it when:**

- You're horizontally scaled. Request 1 (start) and request 2 (resume approval) can land on different instances.
- Your runs can pause for hours or days awaiting approval — a deploy will lose them.

## Going durable: what changes, what stays

The engine already implements replay-from-log — if a `RunStore` implementation persists `RunState` and the step log durably, the engine can resume across a process restart by replaying records into a fresh generator until it reaches the pause point. The `runWorkflow` options field is currently typed `runStore: InMemoryRunStore`, so swapping in a durable implementation today requires a cast; widening that to `RunStore` is on the roadmap.

What a durable implementation needs:

- **`getRunState` / `setRunState` / `deleteRun`** — straightforward UPSERT / SELECT / DELETE on the run row.
- **`appendStep` with atomic CAS** — the engine relies on the conflict semantics of `appendStep`. A Postgres implementation can use a unique constraint on `(run_id, index)`; Redis can use a Lua script with WATCH/MULTI; DynamoDB can use a conditional `PutItem`. Whatever you pick, the contract is: throw `LogConflictError` (with the existing record attached if cheaply available) when another writer already committed at `expectedNextIndex`.
- **`getSteps` ordered ascending by index** — replay reads sequentially.

What you cannot persist:

- **The `LiveRun` handle** (generator, abort controller). Those are in-process JavaScript references. A pause-and-resume across processes goes through the replay path, not through `getLive`.
- **The `pendingApprovalStepId`** field on `LiveRun` is also in-process — used only by the same-process fast path.

The package ships **only the in-memory store today.** Implementing the `RunStore` interface is enough to enable cross-process resume; the engine's replay path doesn't need additional engine-side work.

> **Note:** If your orchestrator never pauses (no `approve()`, no `waitForSignal`, no `sleep`), durability isn't a concern — the run lives entirely inside one streaming response. The in-memory store is fine.

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
    async setRunState(runId, state) {
      metrics.increment("workflow.state.set", {
        status: state.status,
        workflow: state.workflowName,
      });
      return inner.setRunState(runId, state);
    },
    async deleteRun(runId, reason) {
      metrics.increment("workflow.state.delete", { reason });
      return inner.deleteRun(runId, reason);
    },
    async appendStep(runId, expectedNextIndex, record) {
      metrics.increment("workflow.step.append", { kind: record.kind });
      return inner.appendStep(runId, expectedNextIndex, record);
    },
  };
}
```

Same shape, same engine semantics — just instrumented. The spread (`...inner`) preserves `getRunState`, `getSteps`, `setLive`, and `getLive` from the original store; the overrides instrument the mutating paths.

## Where to go next

| You want to… | Read |
|---|---|
| Add the approval primitive before worrying about durability | [Approvals](./approvals) |
| Add OpenTelemetry spans around workflow runs | [OpenTelemetry](../advanced/otel) |
| Look up `inMemoryRunStore` / `RunState` types | [API reference](../api/ai-orchestration) |
