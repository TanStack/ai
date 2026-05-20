---
title: Approvals
id: orchestration-approvals
order: 4
description: "Pause a run for human approval with the approve() primitive. The engine closes the SSE, persists run state, and resumes when the client replies. Supports deny-with-feedback so the model can refine on the next turn."
keywords:
  - tanstack ai
  - approve
  - human-in-the-loop
  - workflow approval
  - pendingApproval
  - resumable workflow
  - approval-requested
---

You've built an orchestrator that writes code. It works. But you don't want it to *commit* code without you saying yes — and if you say no, you want it to use your feedback to refine the spec before trying again.

That's the job of `approve()`. By the end of this guide you'll have a workflow that pauses mid-run, prompts the user with an approval, and either continues or routes back to a refinement step based on the answer.

## The mental model

When user code `yield*`s `approve({ title, description })`, the engine does three things:

1. Emits a `CUSTOM` chunk named `approval-requested` so the client can render an approval prompt.
2. Persists the run state and the live generator handle in the run store.
3. **Closes the SSE stream.** The HTTP request finishes. The server doesn't keep a socket open while waiting.

The run is now *paused*. To resume, the client POSTs `{ runId, approval: { approved, approvalId, feedback? } }` to the same endpoint. The engine pulls the live generator back out of the store, sends the `ApprovalResult` into the generator via `gen.next(value)`, and continues from where it left off.

This pause/resume model means approvals can survive arbitrarily long pauses — a deploy, a server restart (with durable storage — see [Run Persistence](./run-persistence)), the user closing the browser and coming back tomorrow.

## 1. Add an approval to your workflow

Inside any workflow or orchestrator router body, `yield*` an `approve` call:

```typescript
import { approve, defineWorkflow } from "@tanstack/ai-orchestration";

const implementWithApproval = defineWorkflow({
  name: "implement-with-approval",
  input: z.object({ spec: SpecSchema }),
  output: ResultSchema,
  agents: { planner, coder },
  run: async function* ({ input, agents }) {
    const plan = yield* agents.planner({ spec: input.spec });

    const decision = yield* approve({
      title: `Implement ${plan.files.length} files?`,
      description: plan.files.join(", "),
    });

    if (!decision.approved) {
      // Treat denial as a hard stop. See "Deny with feedback" below for the
      // alternative — folding feedback back into a refinement step.
      throw new Error(
        `User declined implementation${decision.feedback ? `: ${decision.feedback}` : ""}`,
      );
    }

    const patches = [];
    for (const filename of plan.files) {
      const patch = yield* agents.coder({ filename, spec: input.spec });
      patches.push(patch);
    }
    return { patches, rationale: plan.rationale };
  },
});
```

`approve` returns a typed `ApprovalResult`:

```typescript
interface ApprovalResult {
  approved: boolean;
  approvalId: string;
  /** Optional free-text feedback. Set when the user denies. */
  feedback?: string;
}
```

`approve` works inside **both** workflow generators and orchestrator routers. The engine treats it identically.

## 2. Render the approval prompt on the client

When the run pauses, `useWorkflow` flips `status` to `'paused'` and populates `pendingApproval`:

```tsx
import { fetchWorkflowEvents, useWorkflow } from "@tanstack/ai-react";

function ApprovalDemo() {
  const run = useWorkflow({
    connection: fetchWorkflowEvents("/api/implement"),
  });

  return (
    <div>
      {/* Steps log... */}

      {run.pendingApproval && (
        <ApprovalPrompt
          title={run.pendingApproval.title}
          description={run.pendingApproval.description}
          onApprove={() => run.approve(true)}
          onDeny={(feedback) => run.approve(false, feedback)}
        />
      )}

      {/* Output, error, etc... */}
    </div>
  );
}
```

`pendingApproval` is `{ approvalId, title, description? } | null`. It's set when the run is paused and cleared the moment you call `run.approve(...)`. The client takes care of resending the right `approvalId` — you only pass `approved: boolean` and optional `feedback: string`.

## 3. Deny with feedback (the refinement loop)

The interesting case isn't a hard deny — it's the user typing "use fastify instead" into the deny box. You want that feedback to flow back into a refinement step, not abort the run.

Inside an orchestrator router, this falls out naturally — yield approve, branch on the result, route back to the spec agent:

```typescript
const featureRouter = defineRouter(
  config,
  function* ({ agents, state, lastResult }) {
    // Fold prior agent results into state...

    const triage = yield* agents.triage({ /* state summary */ });

    if (triage.next === "await-approval") {
      const decision = yield* approve({
        title: "Implement spec?",
        description: `"${state.spec?.title}"`,
      });
      if (decision.approved) {
        return { agent: "implement", input: { spec: state.spec } };
      }
      // Denied: route back to the spec agent carrying the feedback.
      state.pendingFeedback = decision.feedback?.trim() || "refine the spec";
      return {
        agent: "spec",
        input: {
          userMessage: state.pendingFeedback,
          existingSpec: state.spec,
        },
      };
    }
    // ...other branches
  },
);
```

The next turn dispatches the spec agent with the feedback as input. The spec re-runs against the existing spec + the new note, producing a refined spec. Triage routes back to `await-approval`. Loop until approved.

> **Note:** The full pattern — including how to keep the original user message separate from refinement feedback (so the UI still shows the original request after multiple denial turns) — is in `examples/ts-react-chat/src/lib/workflows/orchestrator.ts`. Look for `state.pendingFeedback` vs. `state.lastUserMessage`.

## How resume actually works on the wire

Three HTTP requests cover the typical lifecycle:

**Request 1 (start):** Client POSTs `{ input }`. Server starts the run, streams `RUN_STARTED`, `STEP_STARTED`, `TEXT_MESSAGE_CONTENT` chunks, then the `approval-requested` `CUSTOM` chunk, then the response ends. The server has stored the live generator handle keyed by `runId`.

**Request 2 (resume):** Client POSTs `{ runId, approval: { approvalId, approved, feedback? } }`. Server looks up the live generator, calls `gen.next(approval)`, resumes streaming from where it paused. More step events, possibly another approval, eventually `RUN_FINISHED` or `RUN_ERROR`.

**Request 3 (optional abort):** Client POSTs `{ runId, abort: true }`. Server looks up the run, calls `abortController.abort()`, responds 204. The original SSE stream (request 1 or 2) sees an `aborted` chunk and closes.

`parseWorkflowRequest` + `runWorkflow` handle all three modes — you don't have to branch yourself.

## Multiple approvals in one run

Nothing prevents you from yielding `approve` more than once. Each pause cycles through the same start → pause → resume mechanism. You'd use this for, e.g., a deploy workflow with separate approvals per environment:

```typescript
run: async function* ({ agents }) {
  const plan = yield* agents.plan();

  const staging = yield* approve({
    title: "Deploy to staging?",
    description: plan.summary,
  });
  if (!staging.approved) throw new Error("Aborted at staging");

  yield* agents.deployStaging(plan);

  const prod = yield* approve({
    title: "Smoke tests passed. Deploy to production?",
  });
  if (!prod.approved) throw new Error("Aborted at production");

  yield* agents.deployProd(plan);
}
```

## Where to go next

| You want to… | Read |
|---|---|
| Carry approval state across separate runs (refinement across submissions) | [Refining Across Runs](./refining-across-runs) |
| Make the deny-with-feedback loop survive a server restart | [Run Persistence](./run-persistence) |
| Retry a failing step before reaching the approval | [Retries & Errors](./retries-and-errors) |
