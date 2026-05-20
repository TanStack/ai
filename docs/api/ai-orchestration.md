---
title: "@tanstack/ai-orchestration"
id: tanstack-ai-orchestration-api
order: 8
description: "API reference for @tanstack/ai-orchestration — defineAgent, defineWorkflow, defineOrchestrator, approve(), retry(), runWorkflow, inMemoryRunStore, and the workflow run types."
keywords:
  - tanstack ai
  - "@tanstack/ai-orchestration"
  - defineAgent
  - defineWorkflow
  - defineOrchestrator
  - approve
  - retry
  - runWorkflow
  - RunStore
  - api reference
---

Generator-based workflows and orchestrators for TanStack AI. Compose typed agents with `yield*`, route dynamically with a router generator, pause for approvals, and stream every step as AG-UI events.

For guided journeys see the [Workflows & Orchestration](../orchestration/overview) section.

## Installation

```bash
npm install @tanstack/ai-orchestration
```

Peer dependency: `@tanstack/ai`.

## `defineAgent(config)`

Wrap a function or `chat()` call as a typed agent.

```typescript
import { defineAgent } from "@tanstack/ai-orchestration";
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
        { role: "user", content: `Translate to ${input.target}: ${input.text}` },
      ],
    }),
});
```

### Config

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Unique step name used in events |
| `description` | `string?` | Optional, surfaced in observability |
| `input` | `StandardSchemaV1?` | Validated before `run` is called. `SchemaValidationError` thrown on failure. |
| `output` | `StandardSchemaV1?` | Validated after `run` produces a value. `SchemaValidationError` thrown on failure. |
| `run` | `(args) => AgentRunResult<TOutput>` | The agent body. See return shapes below. |

### `run` argument

`{ input, emit, signal }` — `input` is the typed, validated input. `emit(name, value)` pushes a `CUSTOM` event to the client. `signal` is an `AbortSignal` you can pass to anything that accepts one natively (e.g. `fetch`). For forwarding into `chat()`, bridge to an `AbortController` — see [Retries & Errors](../orchestration/retries-and-errors#3-honor-abort-signals).

### `run` return shapes

| Shape | When |
|---|---|
| `Promise<TOutput>` | Non-LLM agents (DB fetch, computation). |
| `StructuredOutputStream<TOutput>` | `chat({ outputSchema, stream: true })`. The runtime drains and parses. |
| `AsyncIterable<StreamChunk>` | A raw `chat()` stream (no `outputSchema`). Final output parsed from accumulated text. |
| `{ stream, output }` | Manual split — your own stream and a separately-resolved typed value. |

## `defineWorkflow(config)`

Compose agents into a linear generator-based workflow.

```typescript
import { defineWorkflow } from "@tanstack/ai-orchestration";
import { z } from "zod";

const pipeline = defineWorkflow({
  name: "pipeline",
  input: z.object({ text: z.string() }),
  output: z.object({ summary: z.string() }),
  agents: { translate, summarize },
  run: async function* ({ input, agents }) {
    const t = yield* agents.translate({ text: input.text, target: "english" });
    const s = yield* agents.summarize({ text: t.translated });
    return { summary: s.summary };
  },
});
```

### Config

| Field | Type | Description |
|---|---|---|
| `name` | `string` | |
| `description` | `string?` | |
| `input` | `StandardSchemaV1?` | |
| `output` | `StandardSchemaV1?` | |
| `state` | `StandardSchemaV1?` | Shape of mutable state available to the generator. |
| `agents` | `AgentMap` | Record of `defineAgent(...)` or `defineWorkflow(...)` instances. |
| `initialize` | `(args) => Partial<TState>?` | Seed initial state from input. |
| `run` | `(args) => AsyncGenerator<StepDescriptor, TOutput, unknown>` | Generator body. `yield*` agents to compose. |

`run` argument: `{ input, state, agents, emit, signal }`. `state` is mutable. `agents` is the typed bound map — call `agents.someAgent({...})` and `yield*` the result.

## `defineOrchestrator(config)`

A workflow whose `run` body is a routing loop. You write a `router` generator that picks the next agent each turn.

```typescript
import { defineOrchestrator } from "@tanstack/ai-orchestration";

const orchestrator = defineOrchestrator({
  ...sharedConfig,
  name: "feature-orchestrator",
  maxTurns: 20,
  router: function* ({ agents, state, lastResult }) {
    const triage = yield* agents.triage({ /* ... */ });
    if (triage.next === "done") return { done: true, output: { /* ... */ } };
    return { agent: triage.next, input: { /* ... */ } };
  },
});
```

### Config

Inherits all fields from `defineWorkflow`, plus:

| Field | Type | Description |
|---|---|---|
| `router` | `(args) => StepGenerator<RouterDecision>` | Routing generator. |
| `maxTurns` | `number?` | Max router iterations before throwing. Default `12`. |

### `router` argument

`{ input, state, agents, turn, lastResult }`. `turn` is the 0-indexed iteration count. `lastResult` is the typed output of the agent dispatched on the previous turn (`undefined` on turn 0).

### `RouterDecision`

```typescript
type RouterDecision =
  | { done: true; output: TOutput }
  | { done?: false; agent: keyof TAgents; input: unknown };
```

## `defineRouter(config, router)`

Phantom-config helper for pulling the router out of the `defineOrchestrator` call while preserving inference.

```typescript
const config = { agents, input, output, state };
const myRouter = defineRouter(config, function* ({ agents, state }) {
  // `agents` and `state` are typed here.
  return { done: true, output: { /* ... */ } };
});
defineOrchestrator({ ...config, name: "...", router: myRouter });
```

The first argument is ignored at runtime — it exists only so TypeScript can infer the router's `agents` / `input` / `output` / `state` types.

## `approve(options)`

Yieldable approval primitive. Pauses the run, emits `approval-requested`, closes the SSE, resumes on the next client request.

```typescript
const decision = yield* approve({
  title: "Implement?",
  description: "5 files to patch",
});
if (!decision.approved) throw new Error(decision.feedback ?? "Declined");
```

| Option | Type | |
|---|---|---|
| `title` | `string` | Required. Shown by the client. |
| `description` | `string?` | Optional detail. |

Returns `ApprovalResult`:

```typescript
interface ApprovalResult {
  approved: boolean;
  approvalId: string;
  feedback?: string;
}
```

## `retry(fn, options)`

Retry a yieldable step on failure.

```typescript
const draft = yield* retry(
  () => agents.writer({ topic }),
  { attempts: 3, backoff: "exponential", baseDelayMs: 200 },
);
```

| Option | Default | |
|---|---|---|
| `attempts` | — | Total attempts. Required. |
| `backoff` | `'none'` | `'none' \| 'linear' \| 'exponential'` |
| `baseDelayMs` | `100` | Base delay. |
| `maxDelayMs` | `5000` | Max delay cap. |
| `retryOn` | retry any | `(err, attempt) => boolean`. Return `false` to surface the error. |

## `runWorkflow(options)`

Server-side: run a workflow (or orchestrator) and stream AG-UI events.

```typescript
import { toServerSentEventsResponse } from "@tanstack/ai";
import {
  inMemoryRunStore,
  parseWorkflowRequest,
  runWorkflow,
} from "@tanstack/ai-orchestration";

const runStore = inMemoryRunStore({ ttl: 60 * 60 * 1000 });

export async function POST(request: Request) {
  const params = await parseWorkflowRequest(request);
  if (params.abort && params.runId) {
    runStore.getLive(params.runId)?.abortController.abort();
    return new Response(null, { status: 204 });
  }
  const stream = runWorkflow({ workflow, runStore, ...params });
  return toServerSentEventsResponse(stream);
}
```

| Option | Type | |
|---|---|---|
| `workflow` | `WorkflowDefinition` | Required. The workflow or orchestrator. |
| `runStore` | `InMemoryRunStore` | Required. |
| `input` | `unknown?` | Provide on the *first* call to start a run. |
| `runId` | `string?` | Provide alongside `approval` to resume a paused run. |
| `approval` | `ApprovalResult?` | Provide alongside `runId` to resume. |
| `signal` | `AbortSignal?` | Optional external abort. |
| `threadId` | `string?` | Optional correlation ID surfaced in events. |
| `outputSink` | `(output) => void?` | Called with the final output before the store entry is deleted. |

Returns `AsyncIterable<StreamChunk>` — pipe directly to `toServerSentEventsResponse`.

## `parseWorkflowRequest(request)`

Parse a POST body into `runWorkflow` params.

```typescript
const params = await parseWorkflowRequest(request);
// { input?, runId?, approval?, abort? }
```

## `inMemoryRunStore(options)`

Single-process run store. Holds `RunState` plus the live generator handle so the engine can resume in-process.

```typescript
const runStore = inMemoryRunStore({ ttl: 60 * 60 * 1000 });
```

| Option | Default | |
|---|---|---|
| `ttl` | `60 * 60 * 1000` | TTL in ms. Resets on every `set()`. |

Returns `InMemoryRunStore` which extends `RunStore` with `setLive` / `getLive` for the engine-internal live generator handle.

For durable persistence options see [Run Persistence](../orchestration/run-persistence).

## `fail(...)` / `succeed(...)`

Result helpers exported for use in agent / workflow bodies that prefer a Result-typed return over throw/return.

```typescript
import { fail, succeed } from "@tanstack/ai-orchestration";

return succeed({ patches });
// or
return fail("Spec didn't validate");
```

## `SchemaValidationError`

Thrown when input or output validation fails inside an agent.

```typescript
import { SchemaValidationError } from "@tanstack/ai-orchestration";

try {
  // ...
} catch (err) {
  if (err instanceof SchemaValidationError) {
    console.error(err.message, err.issues);
  }
}
```

`issues` is a `ReadonlyArray<unknown>` containing the Standard Schema validation issues.

## Types

| Type | Description |
|---|---|
| `AgentDefinition` | The return type of `defineAgent`. |
| `WorkflowDefinition` | The return type of `defineWorkflow` and `defineOrchestrator`. |
| `AgentMap` | `Record<string, AgentDefinition \| WorkflowDefinition>` |
| `AgentRunArgs<TInput>` | `{ input, emit, signal }` |
| `AgentRunResult<TOutput>` | Union of the four allowable agent return shapes |
| `WorkflowRunArgs<TInput, TState, TAgents>` | `{ input, state, agents, emit, signal }` |
| `BoundAgents<TAgents>` | Typed callable map injected into workflow / router bodies |
| `StepDescriptor` | What the engine sees on `yield`. Tagged `'agent' \| 'nested-workflow' \| 'approval'`. |
| `StepGenerator<T>` | `Generator<StepDescriptor, T, any>` — what `agents.*(...)` returns. |
| `ApprovalResult` | `{ approved, approvalId, feedback? }` |
| `RouterDecision` | `{ done: true, output } \| { agent, input }` |
| `RunState` | Serializable snapshot of a run. |
| `RunStatus` | `'running' \| 'paused' \| 'finished' \| 'error' \| 'aborted'` |
| `RunStore` | Persistence interface: `get` / `set` / `delete`. |
| `InMemoryRunStore` | Extends `RunStore` with `setLive` / `getLive`. |
| `DeleteReason` | `'finished' \| 'error' \| 'aborted'` |
| `EmitFn` | `(name, value) => void` |
| `LiveRun` | Engine-internal live handle (live generator, abort controller, etc). |

## Client-side hooks

The companion client hooks live in framework packages:

- `useWorkflow` — `@tanstack/ai-react`, `@tanstack/ai-solid`, `@tanstack/ai-vue`, `@tanstack/ai-svelte`, `@tanstack/ai-preact`
- `useOrchestration` — same hook, re-exported under a routing-friendly name
- `WorkflowClient` — `@tanstack/ai-client` for vanilla / non-React clients
- `fetchWorkflowEvents(url, options?)` — connection adapter, exported from every framework package and `@tanstack/ai-client`

See the framework-specific [`@tanstack/ai-react` reference](./ai-react) for hook signatures.
