---
title: Workflows & Orchestration Overview
id: orchestration-overview
order: 1
description: "Compose multiple typed LLM steps into a single run with @tanstack/ai-orchestration. Pick the journey: a fixed pipeline (workflows), an LLM-driven router (orchestrators), or human-in-the-loop approvals on top of either."
keywords:
  - tanstack ai
  - workflows
  - orchestration
  - defineAgent
  - defineWorkflow
  - defineOrchestrator
  - multi-step ai
  - agent pipeline
---

`useChat` is the right shape for a single conversation with one LLM call (plus an agent loop for tools). The moment you need *more than one LLM step working together* — extract, then translate, then summarize; or spec, then ask the user, then implement — you've outgrown a single `chat()`. That's what `@tanstack/ai-orchestration` is for.

The package gives you three building blocks: typed **agents** (a wrapped `chat()` call with input/output schemas), **workflows** (an `async function*` that composes agents with `yield*`), and **orchestrators** (a workflow whose next step is decided by a router instead of being hard-coded). All three stream over Server-Sent Events into a `useWorkflow` / `useOrchestration` hook so the UI sees every step as it happens.

```typescript
import { defineAgent, defineWorkflow } from "@tanstack/ai-orchestration";
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const translate = defineAgent({
  name: "translate",
  input: z.object({ text: z.string(), target: z.string() }),
  output: z.object({ translated: z.string() }),
  run: ({ input }) =>
    chat({
      adapter: openaiText("gpt-5.2"),
      outputSchema: z.object({ translated: z.string() }),
      stream: true,
      messages: [
        {
          role: "user",
          content: `Translate to ${input.target}: ${input.text}`,
        },
      ],
    }),
});

const pipeline = defineWorkflow({
  name: "translate-then-summarize",
  input: z.object({ text: z.string() }),
  output: z.object({ summary: z.string() }),
  agents: { translate /*, summarize */ },
  run: async function* ({ input, agents }) {
    const { translated } = yield* agents.translate({
      text: input.text,
      target: "english",
    });
    // ...next step yields here. Final value is the workflow's typed output.
    return { summary: translated.slice(0, 200) };
  },
});
```

The runtime turns that generator into a stream of typed step events the client renders one-by-one.

## When to reach for it

| You have… | Use |
|---|---|
| One LLM call. Maybe tool calls (agent loop). | Plain `chat()` + `useChat`. See [Agentic Cycle](../chat/agentic-cycle). |
| Multiple LLM calls in a **fixed order** (A → B → C) | [Workflows](./workflows) |
| Multiple LLM calls where the **next step depends on the result** of the last | [Orchestrators](./orchestrators) |
| Any of the above, but a step must wait for the user to approve before continuing | [Approvals](./approvals) |
| A run that may take minutes, survive a refresh, or pause for hours awaiting approval | [Run Persistence](./run-persistence) |

The agent loop inside `chat()` is also a form of orchestration — the model picks the next tool, the runtime executes it, the loop runs again. The difference is *who controls the routing*. The agent loop is implicit and lives inside one `chat()` call. Workflows and orchestrators make the routing explicit and put each step on the wire as its own event.

## Terminology

Three definitions you'll see across the package:

**Agent.** A typed wrapper around a `chat()` call (or any async function). Has an `input` schema, an `output` schema, and a `run` function. The runtime validates input and output against the schemas on every invocation.

**Workflow.** An `async function*` whose body composes agents with `yield*`. Linear by default — each step waits for the previous one. The body can branch with `if`, loop with `for`, or call nested workflows.

**Orchestrator.** A workflow whose `run` body is a routing loop. You write a `router` generator that picks the next agent (or returns `done`). Each turn dispatches that agent and feeds its result back via `lastResult`. Built on top of `defineWorkflow` — same engine, same events, just a different shape for the run body.

## Which page do I read?

Pick the journey that matches what you're building. Read just the page you need — they don't overlap.

| You want to… | Read |
|---|---|
| Compose a fixed multi-step LLM pipeline that streams its progress | [Workflows](./workflows) |
| Build a multi-turn agent whose next step is decided dynamically | [Orchestrators](./orchestrators) |
| Pause a run for human approval and resume with feedback | [Approvals](./approvals) |
| Keep state across multiple separate runs (refinement / iteration) | [Refining Across Runs](./refining-across-runs) |
| Retry failing steps and handle abort signals cleanly | [Retries & Errors](./retries-and-errors) |
| Plug in durable storage so runs survive restarts | [Run Persistence](./run-persistence) |
| Look up an API signature | [@tanstack/ai-orchestration API reference](../api/ai-orchestration) |

> **Note:** Workflows and orchestrators both stream AG-UI events into the same `useWorkflow` / `useOrchestration` hook on the client. The client doesn't need to know which shape the server is running — it just reads `steps`, `currentStep`, `pendingApproval`, and `state`.
