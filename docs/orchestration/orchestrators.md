---
title: Orchestrators
id: orchestration-orchestrators
order: 3
description: "When the next step depends on the last result, reach for defineOrchestrator. A router generator picks the next agent each turn; the engine dispatches it, feeds the result back via lastResult, and loops until the router returns done."
keywords:
  - tanstack ai
  - defineOrchestrator
  - defineRouter
  - useOrchestration
  - router pattern
  - state machine ai
  - dynamic agent routing
---

A workflow expects a path you can write out in advance: A, then B, then C. The moment the path branches on a model decision — "if the spec is ready, implement; otherwise refine; otherwise ask the user" — a linear generator stops being the right shape. You either nest `if/else` until the body is unreadable, or you reach for an orchestrator.

By the end of this guide you'll have rewritten the linear pipeline from [Workflows](./workflows) as an orchestrator whose **router** picks the next agent each turn based on accumulated state.

## The mental model

An **orchestrator** is a workflow whose `run` body is a fixed routing loop:

```
for turn = 0..maxTurns:
  decision = router({ input, state, agents, turn, lastResult })
  if decision.done: return decision.output
  lastResult = run(decision.agent, decision.input)
```

You write the **router**. It's a generator that returns one of two decisions per turn:

- `{ agent: 'name', input: {...} }` — dispatch this agent next
- `{ done: true, output: {...} }` — finish the run

The router itself can `yield*` other agents — e.g. a small "triage" agent that decides routing. Whatever it dispatches lands in `lastResult` on the next turn, so the router can fold the result into `state` and decide what to do next.

## When orchestrators win over workflows

Two specific shapes:

1. **The next step depends on a model decision.** "If the model thinks the spec is ready, move on; if not, refine; if it's confused, ask the user." A linear generator forces every branch through nested `if`s. A router lets you ask the model once and dispatch the answer.

2. **You don't know how many turns the run will take.** A user-facing assistant might converge in 2 turns or 12. A workflow generator has to hard-code a loop; a router naturally iterates until `done`.

If your path *is* fixed, stay in workflows. Orchestrators add a layer of routing-decision indirection — worth it when the routing logic is the point, wasteful when there's nothing to decide.

## 1. Define your agents

Reuse the agents from [Workflows](./workflows) — `defineAgent` doesn't care whether the caller is a workflow or an orchestrator. We'll add one more agent, the **triage agent**, whose only job is to look at state and decide what's next.

```typescript
import { defineAgent } from "@tanstack/ai-orchestration";
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const triage = defineAgent({
  name: "triage",
  input: z.object({
    hasTopics: z.boolean(),
    hasOutline: z.boolean(),
    sectionsRemaining: z.number(),
  }),
  output: z.object({
    next: z.enum(["extract-topics", "draft-outline", "expand-section", "done"]),
    reason: z.string(),
  }),
  run: ({ input }) =>
    chat({
      adapter: openaiText("gpt-5.2"),
      outputSchema: z.object({
        next: z.enum([
          "extract-topics",
          "draft-outline",
          "expand-section",
          "done",
        ]),
        reason: z.string(),
      }),
      stream: true,
      systemPrompts: [
        "Pick the next step. Rules: if !hasTopics, return extract-topics. If hasTopics && !hasOutline, return draft-outline. If hasOutline && sectionsRemaining > 0, return expand-section. Otherwise return done.",
      ],
      messages: [{ role: "user", content: JSON.stringify(input) }],
    }),
});
```

Rules-only triage like this one *can* be plain TypeScript inside the router. We use a model here because the next examples will involve fuzzy decisions — "is this spec actually ready?" — where rules fall apart.

## 2. Define orchestrator state

State is what survives across turns inside one run. Define it with a schema:

```typescript
const WriterState = z.object({
  topics: z.array(z.string()).default([]),
  headings: z.array(z.string()).default([]),
  sections: z.array(
    z.object({ heading: z.string(), body: z.string() }),
  ).default([]),
});

const WriterInput = z.object({ text: z.string() });
const WriterOutput = z.object({
  sections: z.array(
    z.object({ heading: z.string(), body: z.string() }),
  ),
});
```

`state` is mutable across router turns. The router reads it to decide what's next, and writes to it after folding in `lastResult`.

## 3. Write the router

The router is a generator. It gets `{ input, state, agents, turn, lastResult }` each turn. It decides what comes next.

```typescript
import { defineRouter } from "@tanstack/ai-orchestration";

const orchestratorConfig = {
  agents: { triage, extractTopics, draftOutline, expandSection },
  input: WriterInput,
  output: WriterOutput,
  state: WriterState,
};

const writerRouter = defineRouter(
  orchestratorConfig,
  function* ({ agents, state, lastResult }) {
    // 1. Fold lastResult into state.
    // The orchestrator dispatches the agent but doesn't know which slice of
    // state its output belongs in — the router does. Without this fold,
    // state stays empty forever and triage loops on the same decision.
    if (lastResult && typeof lastResult === "object") {
      const r = lastResult as Record<string, unknown>;
      if (Array.isArray(r.topics)) state.topics = r.topics as Array<string>;
      if (Array.isArray(r.headings))
        state.headings = r.headings as Array<string>;
      if (typeof r.heading === "string" && typeof r.body === "string") {
        state.sections.push({ heading: r.heading, body: r.body });
      }
    }

    // 2. Ask the triage agent which step is next.
    const decision = yield* agents.triage({
      hasTopics: state.topics.length > 0,
      hasOutline: state.headings.length > 0,
      sectionsRemaining: state.headings.length - state.sections.length,
    });

    // 3. Dispatch the chosen agent.
    if (decision.next === "done") {
      return { done: true, output: { sections: state.sections } };
    }

    if (decision.next === "extract-topics") {
      return { agent: "extractTopics", input: { text: /* input.text */ "" } };
    }

    if (decision.next === "draft-outline") {
      return { agent: "draftOutline", input: { topics: state.topics } };
    }

    // expand-section: pick the next unfinished heading
    const nextHeading = state.headings[state.sections.length];
    if (!nextHeading) {
      return { done: true, output: { sections: state.sections } };
    }
    return {
      agent: "expandSection",
      input: { heading: nextHeading, outline: { headings: state.headings } },
    };
  },
);
```

A few things to call out:

- **`defineRouter(config, router)`** is a phantom-config helper. It exists only to let TypeScript infer the agents map, input, output, and state types when you pull the router out of the `defineOrchestrator` call. The runtime ignores the first argument; the second is the router itself, returned unchanged.

- **`lastResult` is the typed return value of the agent dispatched on the *previous* turn.** On turn 0 it's `undefined`. Cast it back to the agent's output type when you fold it into state — see the example, and [Refining Across Runs](./refining-across-runs) for a cleaner pattern using `state.phase`.

- **`agents.triage(...)`** is `yield*`ed. The triage agent runs as a real step (emits `STEP_STARTED` / `STEP_FINISHED`), the router pauses while it streams, then resumes with the typed decision.

## 4. Wire it into an orchestrator

```typescript
import { defineOrchestrator } from "@tanstack/ai-orchestration";

export const writeArticleOrchestrator = defineOrchestrator({
  ...orchestratorConfig,
  name: "write-article-orchestrator",
  router: writerRouter,
  maxTurns: 20,
});
```

The orchestrator is *still* a `WorkflowDefinition` under the hood — `defineOrchestrator` wraps your router in a workflow whose `run` body is the routing loop above. That means everything in [Workflows](./workflows) carries over: same `runWorkflow` server entry point, same `useWorkflow` / `useOrchestration` client hook, same `STEP_STARTED` / `STEP_FINISHED` events.

`maxTurns` defaults to 12. The engine throws if the router doesn't return `done` before then — protects against runaway loops.

## 5. Server route

Identical to the workflow route, just with the orchestrator passed in:

```typescript
import { toServerSentEventsResponse } from "@tanstack/ai";
import {
  inMemoryRunStore,
  parseWorkflowRequest,
  runWorkflow,
} from "@tanstack/ai-orchestration";
import { writeArticleOrchestrator } from "./orchestrator";

const runStore = inMemoryRunStore({ ttl: 60 * 60 * 1000 });

export async function POST(request: Request) {
  const params = await parseWorkflowRequest(request);
  if (params.abort && params.runId) {
    runStore.getLive(params.runId)?.abortController.abort();
    return new Response(null, { status: 204 });
  }
  const stream = runWorkflow({
    workflow: writeArticleOrchestrator,
    runStore,
    ...params,
  });
  return toServerSentEventsResponse(stream);
}
```

## 6. Client hook

`useOrchestration` is the same hook as `useWorkflow` — re-exported under a name that fits the vocabulary better when you're driving a routing-loop orchestrator.

```tsx
import { fetchWorkflowEvents, useOrchestration } from "@tanstack/ai-react";

const orch = useOrchestration<
  { text: string },
  { sections: Array<{ heading: string; body: string }> },
  { topics: Array<string>; headings: Array<string>; sections: Array<{ heading: string; body: string }> }
>({
  connection: fetchWorkflowEvents("/api/article"),
});

// orch.state is the typed orchestrator state (snapshot of the latest
// STATE_DELTA event the server emitted). The router writes to it; the
// client sees it propagate on every turn.
```

The third type parameter on `useOrchestration` is the orchestrator's `state` shape — the client receives an updated snapshot of it on every router turn via `STATE_DELTA` events the engine emits automatically.

## What `useOrchestration` gives you

Same surface as `useWorkflow`:

| Field | What it carries |
|---|---|
| `runId` | Server-assigned run ID. Sent back on resume. |
| `status` | `'idle' \| 'running' \| 'paused' \| 'finished' \| 'error' \| 'aborted'` |
| `steps` | Array of every step the engine has emitted, in order |
| `currentStep` | The currently running step (or `null`) |
| `currentText` | Live text accumulating in the active step — pipe `parsePartialJSON` over it for live structured-output rendering |
| `state` | Snapshot of orchestrator state. Updates every turn. |
| `output` | Final typed output. Populated on `finished`. |
| `error` | `{ message, code? }` on error |
| `pendingApproval` | Non-null while the run is paused awaiting approval — see [Approvals](./approvals) |
| `start(input)` | Kick off a fresh run |
| `approve(approved, feedback?)` | Resolve a pending approval |
| `stop()` | Abort the run |

## Where to go next

| You want to… | Read |
|---|---|
| Gate a step on user approval (continue / refine with feedback) | [Approvals](./approvals) |
| Carry state across separate runs (the user refines the result across submissions) | [Refining Across Runs](./refining-across-runs) |
| Retry the triage agent or any other step on failure | [Retries & Errors](./retries-and-errors) |
| See the orchestrator pattern in a complete app | `examples/ts-react-chat/src/lib/workflows/orchestrator.ts` |
