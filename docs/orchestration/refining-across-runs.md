---
title: Refining Across Runs
id: orchestration-refining-across-runs
order: 5
description: "Keep state across multiple separate orchestrator runs by passing the previous run's result back as the next run's input. The initialize() hook seeds state mid-flow so a follow-up message refines instead of restarting."
keywords:
  - tanstack ai
  - orchestrator state
  - initialize
  - previousSpec
  - refinement
  - multi-run orchestrator
  - carryover state
---

A single orchestrator run carries state from turn to turn — see [Orchestrators](./orchestrators). But state doesn't survive across *separate* runs. By default, every `run.start(...)` call begins from scratch.

That's often wrong. If your user just got back a generated spec and types "make it use TypeScript instead", they don't want a brand-new run that ignores the previous result — they want a refinement. This guide shows how to thread the previous run's result into the next run so it picks up where the last one left off.

## The mental model

Three pieces work together:

1. **The orchestrator's input schema includes optional `previous*` fields** that carry the prior run's relevant outputs (spec, result, plan, whatever).
2. **The `initialize()` hook reads input** and seeds the initial state so the run starts *mid-flow* rather than at the beginning.
3. **The client tracks the most recent finished run's output and passes it back** as `previousX` on the next `start()` call.

Result: the orchestrator looks identical between "first run" and "refinement run" — same code, same router. The only difference is where in the state machine the router lands on turn 0.

## 1. Extend the orchestrator's input

Add optional fields for the prior outputs you want to carry over:

```typescript
import { z } from "zod";

const SpecSchema = z.object({
  title: z.string(),
  summary: z.string(),
  files: z.array(z.string()),
});

const ResultSchema = z.object({
  patches: z.array(z.object({ filename: z.string(), patch: z.string() })),
  rationale: z.string(),
});

const OrchestratorInput = z.object({
  userMessage: z.string(),
  /** Spec carried over from a prior finished run. When provided, the
   * orchestrator initializes mid-flow so the new userMessage is treated as
   * refinement feedback rather than a fresh scoping request. */
  previousSpec: SpecSchema.optional(),
  /** Implementation result carried over from a prior finished run. */
  previousResult: ResultSchema.optional(),
});
```

## 2. Use `initialize()` to seed state

The `initialize` hook runs once at the start of the run, *before* the first router turn. It reads the input and returns a partial initial state. Use it to detect a refinement run and pre-populate state:

```typescript
import { defineOrchestrator } from "@tanstack/ai-orchestration";

const OrchestratorState = z.object({
  phase: z
    .enum(["scoping", "implementing", "review", "done"])
    .default("scoping"),
  spec: SpecSchema.optional(),
  result: ResultSchema.optional(),
  /** Original user request, kept for UI display. */
  lastUserMessage: z.string().default(""),
  /** Text the orchestrator still needs to address — the initial request on
   * turn 0, or refinement feedback when the user denied approval. Cleared
   * once consumed so triage doesn't loop on the same note. */
  pendingFeedback: z.string().default(""),
});

export const featureOrchestrator = defineOrchestrator({
  name: "feature-orchestrator",
  input: OrchestratorInput,
  output: /* ... */,
  state: OrchestratorState,
  agents: { /* spec, implement, review, triage */ },
  router: featureRouter,
  initialize: ({ input }) => {
    if (input.previousSpec) {
      // Refinement run: start mid-flow with the prior spec/result loaded.
      // Triage will see "has spec + has feedback" and route to refine.
      return {
        lastUserMessage: input.userMessage,
        pendingFeedback: input.userMessage,
        spec: input.previousSpec,
        result: input.previousResult,
        phase: "review" as const,
      };
    }
    // Fresh run: just stash the message and let triage start at scoping.
    return {
      lastUserMessage: input.userMessage,
      pendingFeedback: input.userMessage,
    };
  },
});
```

The router doesn't change. It still reads `state.spec`, `state.pendingFeedback`, `state.phase` and decides what to do — it's just that on a refinement run, `state` arrives at turn 0 already populated, so the router takes the refinement branch immediately.

## 3. Track and pass `previousX` on the client

On the client, snapshot the last finished run's output and pass it back next time:

```tsx
import { useEffect, useRef, useState } from "react";
import { fetchWorkflowEvents, useOrchestration } from "@tanstack/ai-react";

interface Carryover {
  spec?: Spec;
  result?: Result;
}

function FeatureChat() {
  const [carryover, setCarryover] = useState<Carryover | null>(null);
  const [input, setInput] = useState("");

  const orch = useOrchestration({
    input: OrchestratorInput,
    output: OrchestratorOutput,
    connection: fetchWorkflowEvents("/api/feature"),
  });
  const state = orch.state as
    | { spec?: Spec; result?: Result; phase?: string }
    | undefined;

  // When a run finishes, snapshot the spec + result for the next submission.
  const snapshottedRef = useRef<string | null>(null);
  useEffect(() => {
    if (orch.status !== "finished") return;
    if (!orch.runId || snapshottedRef.current === orch.runId) return;
    snapshottedRef.current = orch.runId;
    if (state?.spec) {
      setCarryover({ spec: state.spec, result: state.result });
    }
  }, [orch.status, orch.runId, state]);

  const submit = () => {
    void orch.start({
      userMessage: input,
      previousSpec: carryover?.spec,
      previousResult: carryover?.result,
    });
    setInput("");
  };

  return (
    <div>
      {carryover && (
        <div>
          Refining previous spec.{" "}
          <button onClick={() => setCarryover(null)}>Clear</button>
        </div>
      )}
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={submit}>Send</button>
    </div>
  );
}
```

Two messages later, the user has refined the spec twice. Each `start()` is a fresh run on the server, but each one initializes with the prior result in `state` — so the model sees the existing spec, applies the new feedback, and produces the next revision.

## Why this works without explicit cross-run state

Each run is independent at the engine level — `runId` differs, the run store has separate entries, in-memory state isn't shared. The "refinement" illusion comes entirely from `initialize()` reading `previousX` out of the input and pre-seeding state.

That's deliberate. It means:

- The server is **stateless across runs**. A horizontally-scaled deployment doesn't need sticky sessions.
- The client owns the cross-run state. Want to persist refinements across page reloads? Stash `carryover` in `localStorage` or a server-side session.
- "Start a fresh run" is just "don't pass `previousX`". No reset endpoint needed.

The cost: the client has to keep track of which slice of the prior result is relevant to the next run. For most apps that's a 5-field carryover object — small.

## Refinement vs. resume: not the same thing

Refinement and approval-resume both involve "continue from prior state", but they're different mechanisms:

| | Refinement (this page) | Resume (see [Approvals](./approvals)) |
|---|---|---|
| Run ID | New each time | Same across pause/resume |
| Storage | Client carries `previousX` | Server stores run state and events |
| State shape | Pre-seeded by `initialize()` | The exact state at pause |
| Time scale | Any (minutes, days, weeks) | Bounded by run store TTL |
| Failure mode if storage dies | None — client still has carryover | Run is lost |

You can use both at once: an orchestrator with an approval pause *inside* a single run, and refinement carryover *across* separate runs. The feature-orchestrator example does exactly that.

## Where to go next

| You want to… | Read |
|---|---|
| Make a refinement run survive a server restart with no client carryover | [Run Persistence](./run-persistence) |
| Retry the spec or implement step on transient failures | [Retries & Errors](./retries-and-errors) |
| See the full feature orchestrator with refinement + approval + carryover | `examples/ts-react-chat/src/lib/workflows/orchestrator.ts` |
