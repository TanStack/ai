---
title: Retries & Errors
id: orchestration-retries-and-errors
order: 6
description: "Retry a yieldable step on failure with the retry() primitive — linear, exponential, or no backoff. Wire AbortSignal through chat() so cancellation is honored. Schema validation failures surface as typed SchemaValidationError."
keywords:
  - tanstack ai
  - retry
  - SchemaValidationError
  - workflow error handling
  - abort signal
  - exponential backoff
  - resilient orchestrator
---

The happy path works. Now you need it to keep working when the network blips, the model returns a malformed JSON object, or the user closes their tab mid-run. This guide covers the three failure surfaces in `@tanstack/ai-orchestration` and the tools the package gives you to handle them.

## The three failure surfaces

1. **Transient errors during an agent's `run`** — network errors, provider rate limits, timeouts. Handle with `retry()`.
2. **Schema validation failures** — the model returned JSON that doesn't match `output`. The engine throws `SchemaValidationError`. You can retry it like any other error, or fail the run.
3. **Abort** — the user clicked stop, or the request was cancelled. The engine wires `AbortSignal` through agents; agents must respect it.

## 1. Retry transient failures

`retry(fn, options)` wraps a yield-producing step. Each attempt invokes `fn()` fresh — the underlying generator restarts.

```typescript
import { retry } from "@tanstack/ai-orchestration";

run: async function* ({ agents }) {
  const draft = yield* retry(
    () => agents.writer({ topic: "tanstack-ai" }),
    { attempts: 3, backoff: "exponential" },
  );
  // ...
}
```

`retry` works inside both workflow generators and orchestrator routers, and around any yieldable step — agents, nested workflows, or even other `retry` calls.

### Options

| Option | Default | Effect |
|---|---|---|
| `attempts` | (required) | Total attempts including the first. `attempts: 3` retries up to twice on failure. |
| `backoff` | `'none'` | `'none'` retries immediately. `'linear'` waits `baseDelayMs * attempt`. `'exponential'` waits `baseDelayMs * 2 ** (attempt - 1)`. |
| `baseDelayMs` | `100` | Base delay (linear & exponential). |
| `maxDelayMs` | `5000` | Caps the computed delay. Both modes clamp to this. |
| `retryOn` | retry any | Predicate `(err, attempt) => boolean`. Return `false` to stop retrying and surface the error. |

Use `retryOn` to be selective — retry rate limits, fail fast on schema violations:

```typescript
import { SchemaValidationError, retry } from "@tanstack/ai-orchestration";

const result = yield* retry(
  () => agents.parser({ document }),
  {
    attempts: 5,
    backoff: "exponential",
    retryOn: (err) => !(err instanceof SchemaValidationError),
  },
);
```

If `retryOn` returns `false`, `retry` rethrows the error immediately without further delay.

## 2. Handle schema validation errors

When an agent has an `output` schema, the engine validates the agent's final value before resuming the workflow. If validation fails, `invokeAgent` throws `SchemaValidationError` — a typed error with the validation issues attached.

```typescript
import { SchemaValidationError } from "@tanstack/ai-orchestration";

run: async function* ({ agents }) {
  try {
    const spec = yield* agents.specWriter({ text });
    return { spec };
  } catch (err) {
    if (err instanceof SchemaValidationError) {
      // The model returned shape that didn't match the schema.
      // Surface a typed failure, or retry with a stricter prompt.
      return { spec: null, error: "Spec didn't validate" };
    }
    throw err;
  }
}
```

`SchemaValidationError` exposes the same `issues` array that Standard Schema returns. Inspect it to decide whether the failure is recoverable.

## 3. Honor abort signals

Workflows are abortable. The client calls `run.stop()`; the server route looks up the live run and calls `abortController.abort()`; the engine sees `signal.aborted` on its drain loop and stops emitting events.

The run *will* end either way — the engine guards every yield boundary against abort. The question is what happens to the agent's in-flight work. If the agent ignores the signal, the underlying `fetch` or `chat()` call keeps running until it finishes naturally — wasting tokens or other resources before its output is discarded.

Every agent's `run` receives `{ input, emit, signal }`. For APIs that accept `AbortSignal` natively, pass `signal` through:

```typescript
const reader = defineAgent({
  name: "reader",
  input: z.object({ url: z.string() }),
  output: z.object({ text: z.string() }),
  run: async ({ input, signal }) => {
    const res = await fetch(input.url, { signal });
    return { text: await res.text() };
  },
});
```

`chat()` from `@tanstack/ai` takes an `AbortController` (not a raw signal). Bridge the agent's signal into a controller before calling `chat()`:

```typescript
const writer = defineAgent({
  // ...
  run: ({ input, signal }) => {
    const abortController = new AbortController();
    if (signal.aborted) abortController.abort();
    else
      signal.addEventListener("abort", () => abortController.abort(), {
        once: true,
      });
    return chat({
      adapter: openaiText("gpt-5.2"),
      messages: [{ role: "user", content: input.prompt }],
      abortController,
    });
  },
});
```

Skipping the bridge isn't a correctness problem — the run still aborts — but the provider call keeps spending tokens until it returns.

## 4. What the client sees

`useWorkflow` / `useOrchestration` surface failures and aborts on the same state object:

```tsx
const run = useWorkflow({ /* ... */ });

if (run.status === "error" && run.error) {
  return <ErrorBanner message={run.error.message} code={run.error.code} />;
}
if (run.status === "aborted") {
  return <p>Run cancelled.</p>;
}
```

`run.error` is `{ message: string; code?: string } | null`. It's populated when `status === 'error'`. For the failed step specifically, look at `run.steps` — the failing step's `status` is `'failed'` and its `result` carries the serialized error.

## 5. Patterns that compose

**Retry + approval.** Wrap the dispatch *before* the approval pause; once the user approves there's no point retrying — the run is past the failure mode.

**Retry + nested workflow.** Treat the nested workflow as a single yieldable unit. `retry(() => agents.implementWorkflow(input), { attempts: 2 })` reruns the entire nested workflow on failure.

**Try/catch around a router branch.** Inside an orchestrator router, catch a transient failure and dispatch a fallback agent:

```typescript
const router = defineRouter(config, function* ({ agents, state }) {
  if (state.phase === "implementing") {
    try {
      const result = yield* retry(
        () => agents.coder({ /* ... */ }),
        { attempts: 2, backoff: "exponential" },
      );
      return { done: true, output: result };
    } catch {
      return { agent: "fallback", input: { /* ... */ } };
    }
  }
  // ...
});
```

## Where to go next

| You want to… | Read |
|---|---|
| Persist runs so a server crash mid-retry doesn't lose the run | [Run Persistence](./run-persistence) |
| Add observability around retries and failures | [Middleware](../advanced/middleware) and [OpenTelemetry](../advanced/otel) |
| Look up `retry` / `SchemaValidationError` signatures | [API reference](../api/ai-orchestration) |
