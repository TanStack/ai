---
title: Run Persistence
id: orchestration-run-persistence
order: 7
description: "How runWorkflow stores run state and events, and what it takes to durable-store a paused run across process restarts."
keywords:
  - tanstack ai
  - RunStore
  - inMemoryRunStore
  - durable workflow
  - workflow persistence
  - resume across restarts
  - RunState
---

`runWorkflow` needs somewhere to keep the run while it's paused. A workflow that yields `approve()` closes the SSE; the next HTTP request has to find the right run state and event history, replay to the pause point, deliver the approval, and continue streaming. That "somewhere" is the **run store**.

This page covers what the store actually holds, the default in-memory implementation, and what's involved in plugging in a durable backend for long-lived approvals.

## What's in a run store

The current engine contract has two halves — a `RunState` snapshot and an append-only event log used by replay:

```typescript
interface RunStore {
  // State snapshot
  getRunState: (runId: string) => Promise<RunState | undefined>;
  setRunState: (runId: string, state: RunState) => Promise<void>;
  deleteRun: (runId: string, reason: DeleteReason) => Promise<void>;

  // Append-only event log (CAS)
  appendEvent: (
    runId: string,
    expectedNextIndex: number,
    event: WorkflowEvent,
  ) => Promise<void>;
  getEvents: (runId: string) => Promise<ReadonlyArray<WorkflowEvent>>;

  // Optional: push newly appended events to attached subscribers.
  subscribe?: (runId: string, signal?: AbortSignal) => AsyncIterable<WorkflowEvent>;
}
```

`appendEvent` is contractually atomic — it throws `LogConflictError` if another writer has already committed at `expectedNextIndex`. The engine uses this to distinguish idempotent retries (same `signalId`) from lost races (different `signalId`).

`RunState` is the serializable snapshot:

```typescript
interface RunState<TInput = unknown, TState = unknown, TOutput = unknown> {
  runId: string;
  status: "running" | "paused" | "finished" | "error" | "aborted";
  workflowName: string;
  workflowVersion?: string;
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

That's the wire format. Everything a host needs to *describe* a run without actually executing it. `workflowVersion` is load-bearing for durable resume: hosts running multiple workflow versions use it to route a resumed run to the compatible workflow definition.

## Compatibility helpers on the in-memory store

`inMemoryRunStore` also exposes older helper methods for compatibility:

```typescript
interface InMemoryRunStore extends RunStore {
  appendStep: (
    runId: string,
    expectedNextIndex: number,
    record: StepRecord,
  ) => Promise<void>;
  getSteps: (runId: string) => Promise<ReadonlyArray<StepRecord>>;
  setLive: (runId: string, live: LiveRun) => void;
  getLive: (runId: string) => LiveRun | undefined;
}
```

`appendStep` / `getSteps` translate to the event log. `setLive` / `getLive` are process-local compatibility helpers, not the engine contract for custom stores.

The live handle itself is not serializable:

```typescript
interface LiveRun {
  runState: RunState;
  generator: AsyncGenerator<StepDescriptor, unknown, unknown>;
  abortController: AbortController;
  approvalResolver?: (result: ApprovalResult) => void;
  pendingEvents: Array<StreamChunk>;
  pendingApprovalStepId?: string;
}
```

The `generator`, `abortController`, and `approvalResolver` are JavaScript references that only exist inside one process. Do not build your production API around them. For stop requests, keep host-owned `AbortController`s in your route or job runner, pass `signal: controller.signal` to `runWorkflow`, and abort that controller when the client sends `abort: true`.

Durable resume uses the **replay-from-log** path: the engine reads `getEvents(runId)`, reconstructs the run by replaying those events into a fresh generator until it reaches the pause point, then resumes from there. Compatible workflow version routing is what keeps replay aligned with the code that started the run.

## The default: `inMemoryRunStore`

```typescript
import { inMemoryRunStore } from "@tanstack/ai-orchestration";

const runStore = inMemoryRunStore({
  ttl: 60 * 60 * 1000, // 1 hour
});
```

The TTL governs how long a `RunState` (and its event log plus compatibility live handle) survive after the last update. Store activity resets the timer. After the TTL expires, the entry is dropped — a resume request with that `runId` 404s.

> **Note:** A run that pauses longer than the TTL with no intermediate engine activity will silently be deleted. For long-lived approvals or sleeps, raise `ttl` or use a durable store implementation.

**Use it when:**

- You're prototyping.
- Your workflows always finish in a single request (no `approve()` calls, no pauses).
- You're running a single process and don't care about losing in-flight runs on restart.

**Don't use it when:**

- You're horizontally scaled. Request 1 (start) and request 2 (resume approval) can land on different instances.
- Your runs can pause for hours or days awaiting approval — a deploy or restart loses them unless you use durable event-log storage and route resumes to a compatible workflow version.

## Going durable: what changes, what stays

The engine already implements replay-from-log — if a `RunStore` implementation persists `RunState` and the event log durably, the engine can resume across a process restart by replaying events into a fresh generator until it reaches the pause point. Cross-deploy resume also requires compatible workflow version routing, typically with `version` plus `createWorkflowRegistry`.

What a durable implementation needs:

- **`getRunState` / `setRunState` / `deleteRun`** — straightforward UPSERT / SELECT / DELETE on the run row.
- **`appendEvent` with atomic CAS** — the engine relies on the conflict semantics of `appendEvent`. A Postgres implementation can use a unique constraint on `(run_id, index)`; Redis can use a Lua script with WATCH/MULTI; DynamoDB can use a conditional `PutItem`. Whatever you pick, the contract is: throw `LogConflictError` (with the existing event attached if cheaply available) when another writer already committed at `expectedNextIndex`.
- **`getEvents` ordered ascending by index** — replay reads sequentially.
- **Optional `subscribe`** — expose newly appended events to attached clients without polling.

What you cannot persist:

- **The `LiveRun` handle** (generator, abort controller). Those are in-process JavaScript references. A pause-and-resume across processes goes through the replay path, not through `getLive`.
- **The `pendingApprovalStepId`** field on `LiveRun` is also in-process — used only by the same-process fast path.

The package ships **only the in-memory store today.** Implementing the `RunStore` interface is enough for the storage side of cross-process resume; durable deployments also need compatible workflow version routing.

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
    async appendEvent(runId, expectedNextIndex, event) {
      metrics.increment("workflow.event.append", { type: event.type });
      return inner.appendEvent(runId, expectedNextIndex, event);
    },
  };
}
```

Same shape, same engine semantics — just instrumented. The spread (`...inner`) preserves `getRunState`, `getEvents`, optional subscription support, and the in-memory compatibility helpers from the original store; the overrides instrument the mutating paths.

## Where to go next

| You want to… | Read |
|---|---|
| Add the approval primitive before worrying about durability | [Approvals](./approvals) |
| Add OpenTelemetry spans around workflow runs | [OpenTelemetry](../advanced/otel) |
| Look up `inMemoryRunStore` / `RunState` types | [API reference](../api/ai-orchestration) |
