---
title: Workflows
id: orchestration-workflows
order: 2
description: "Build a typed, multi-step LLM pipeline with defineAgent + defineWorkflow. Each step streams its progress to the UI through useWorkflow. Linear by default — branch with if, loop with for, nest workflows inside workflows."
keywords:
  - tanstack ai
  - defineWorkflow
  - defineAgent
  - useWorkflow
  - multi-step llm
  - generator pipeline
  - structured agent steps
  - yield star
---

You have a fixed pipeline in mind: extract a list of topics from the user's text, then generate a draft outline, then expand each section. Today you'd chain three `chat()` calls by hand, parse the intermediate JSON, plumb the results through, and write your own SSE format if you want the UI to see progress.

By the end of this guide you'll have that pipeline expressed as a typed workflow — three agents composed with `yield*`, streamed as AG-UI events, and rendered in a React UI that shows each step as it happens.

## The mental model

A **workflow** is an `async function*` whose body composes agents with `yield*`. Each `yield*` waits for the agent to finish (or, for streaming agents, drains the stream), then resumes the generator with the typed return value. The runtime turns every `yield*` into a `STEP_STARTED` / `STEP_FINISHED` event pair on the wire.

```typescript
run: async function* ({ input, agents }) {
  const topics = yield* agents.extractTopics({ text: input.text });
  const outline = yield* agents.draftOutline({ topics });
  const sections = [];
  for (const heading of outline.headings) {
    const body = yield* agents.expandSection({ heading, outline });
    sections.push({ heading, body });
  }
  return { sections };
}
```

The body is plain TypeScript. `for`, `if`, `try`, `Promise.all` — they all work. The runtime cares only about what you `yield*`.

## 1. Install the package

```bash
pnpm add @tanstack/ai-orchestration
```

`@tanstack/ai-orchestration` declares `@tanstack/ai` as a peer dependency — install it alongside whatever provider adapter you're using.

## 2. Define your agents

An agent is a typed wrapper around a `chat()` call (or any async function that returns a value matching the output schema). Use `defineAgent`:

```typescript
import { defineAgent } from "@tanstack/ai-orchestration";
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const extractTopics = defineAgent({
  name: "extract-topics",
  input: z.object({ text: z.string() }),
  output: z.object({ topics: z.array(z.string()) }),
  run: ({ input }) =>
    chat({
      adapter: openaiText("gpt-5.2"),
      outputSchema: z.object({ topics: z.array(z.string()) }),
      stream: true,
      systemPrompts: ["Extract 3-5 topics covered by the text."],
      messages: [{ role: "user", content: input.text }],
    }),
});
```

`run` accepts `{ input, emit, signal }`. The runtime:

- Validates `input` against the `input` schema before calling you.
- Pipes the `TEXT_MESSAGE_CONTENT` deltas from the stream you return as `currentText` on the client.
- Validates the final value against the `output` schema before resuming the workflow generator.

`signal` is an `AbortSignal` you can pass to anything that natively accepts one (e.g. `fetch(url, { signal })`). For forwarding into `chat()` see [Retries & Errors](./retries-and-errors#3-honor-abort-signals).

`run` can return any of these:

| Return type | When to use |
|---|---|
| `Promise<TOutput>` | The agent isn't an LLM — it's a function (e.g. fetch a record from your DB) |
| `StructuredOutputStream<TOutput>` (from `chat({ outputSchema, stream: true })`) | Streaming structured output. The runtime auto-detects this and emits delta events |
| `AsyncIterable<StreamChunk>` | A raw `chat()` stream you've assembled yourself |
| `{ stream, output }` | A streaming agent where the final typed value is resolved separately |

For the rest of this guide we'll use `chat({ outputSchema, stream: true })` — it gives you live deltas in the UI and a typed final value for the workflow.

Define the other two agents the same way:

```typescript
const draftOutline = defineAgent({
  name: "draft-outline",
  input: z.object({ topics: z.array(z.string()) }),
  output: z.object({ headings: z.array(z.string()) }),
  run: ({ input }) =>
    chat({
      adapter: openaiText("gpt-5.2"),
      outputSchema: z.object({ headings: z.array(z.string()) }),
      stream: true,
      systemPrompts: ["Produce 4-7 section headings covering these topics."],
      messages: [{ role: "user", content: input.topics.join(", ") }],
    }),
});

const expandSection = defineAgent({
  name: "expand-section",
  input: z.object({
    heading: z.string(),
    outline: z.object({ headings: z.array(z.string()) }),
  }),
  output: z.object({ body: z.string() }),
  run: ({ input }) =>
    chat({
      adapter: openaiText("gpt-5.2"),
      outputSchema: z.object({ body: z.string() }),
      stream: true,
      systemPrompts: [
        "Write 2-3 paragraphs for this section. Keep tone consistent with the outline.",
      ],
      messages: [
        {
          role: "user",
          content: `Heading: ${input.heading}\nOutline: ${input.outline.headings.join(", ")}`,
        },
      ],
    }),
});
```

## 3. Compose them into a workflow

```typescript
import { defineWorkflow } from "@tanstack/ai-orchestration";

export const writeArticle = defineWorkflow({
  name: "write-article",
  input: z.object({ text: z.string() }),
  output: z.object({
    sections: z.array(
      z.object({ heading: z.string(), body: z.string() }),
    ),
  }),
  agents: { extractTopics, draftOutline, expandSection },
  run: async function* ({ input, agents }) {
    const { topics } = yield* agents.extractTopics({ text: input.text });
    const outline = yield* agents.draftOutline({ topics });

    const sections: Array<{ heading: string; body: string }> = [];
    for (const heading of outline.headings) {
      const { body } = yield* agents.expandSection({ heading, outline });
      sections.push({ heading, body });
    }

    return { sections };
  },
});
```

`agents.extractTopics({...})` is **typed** — TypeScript knows `extractTopics`'s input shape from the `input` schema you gave `defineAgent`, and infers the return type from the `output` schema. Misspell a field and the build fails.

`yield*` is the composition operator: it delegates to the agent's internal step generator, waits for it to complete, and resumes your workflow with the typed result.

## 4. Serve it over SSE

Workflows live on the server. The client never sees the generator — it sees a stream of typed events. Wire up the route:

```typescript
// app/api/article/route.ts (Next.js / TanStack Start / any web framework)
import { toServerSentEventsResponse } from "@tanstack/ai";
import {
  inMemoryRunStore,
  parseWorkflowRequest,
  runWorkflow,
} from "@tanstack/ai-orchestration";
import { writeArticle } from "./workflow";

const runStore = inMemoryRunStore({ ttl: 60 * 60 * 1000 });

export async function POST(request: Request) {
  const params = await parseWorkflowRequest(request);

  if (params.abort && params.runId) {
    runStore.getLive(params.runId)?.abortController.abort();
    return new Response(null, { status: 204 });
  }

  const stream = runWorkflow({
    workflow: writeArticle,
    runStore,
    ...params,
  });
  return toServerSentEventsResponse(stream);
}
```

`parseWorkflowRequest` extracts the four fields the client sends: `input` (first call), `runId` + `approval` (resume after pause), or `abort: true` (stop signal). `runWorkflow` handles all three modes — see the [API reference](../api/ai-orchestration) for details.

`inMemoryRunStore({ ttl })` is the default persistence. Runs that pause for approval are stored here until they resume or expire. For production you'll want a durable store — see [Run Persistence](./run-persistence).

## 5. Render it on the client

`useWorkflow` from `@tanstack/ai-react` (also exported as `useOrchestration` — same hook, different vocabulary) gives you the run state.

```tsx
import { fetchWorkflowEvents, useWorkflow } from "@tanstack/ai-react";

interface ArticleInput {
  text: string;
}

interface ArticleOutput {
  sections: Array<{ heading: string; body: string }>;
}

function ArticleWriter() {
  const run = useWorkflow<ArticleInput, ArticleOutput>({
    connection: fetchWorkflowEvents("/api/article"),
  });

  return (
    <div>
      <button
        onClick={() =>
          run.start({ text: "TanStack AI is a type-safe AI SDK..." })
        }
        disabled={run.status === "running"}
      >
        Write article
      </button>

      <ul>
        {run.steps.map((step) => (
          <li key={step.stepId}>
            [{step.stepName}] {step.status}
            {step.status === "running" && (
              <pre>{step.stepId === run.currentStep?.stepId
                ? run.currentText
                : ""}</pre>
            )}
          </li>
        ))}
      </ul>

      {run.status === "finished" && run.output?.sections.map((s) => (
        <section key={s.heading}>
          <h2>{s.heading}</h2>
          <p>{s.body}</p>
        </section>
      ))}
    </div>
  );
}
```

You now have a typed three-step pipeline that streams every intermediate result to the UI. The user sees `[extract-topics] running`, then the topics land; `[draft-outline] running`, then the headings; then `[expand-section]` for each section, one after another.

## Branching, looping, and nesting

The workflow body is just TypeScript. Anything you can write with a generator works:

```typescript
run: async function* ({ input, agents }) {
  const topics = yield* agents.extractTopics({ text: input.text });

  // Branch on result
  if (topics.topics.length < 2) {
    return { sections: [] };
  }

  // Loop with for / while
  const outline = yield* agents.draftOutline({ topics: topics.topics });
  const sections = [];
  for (const heading of outline.headings) {
    const { body } = yield* agents.expandSection({ heading, outline });
    sections.push({ heading, body });
  }
  return { sections };
}
```

Nested workflows are agents too — pass another `defineWorkflow(...)` result in the `agents` map and call it the same way. The engine recursively runs the nested generator, emits `nested-workflow` step events, and returns its typed output to the parent.

```typescript
const summarize = defineWorkflow({ /* ... */ });

const writeAndSummarize = defineWorkflow({
  name: "write-and-summarize",
  agents: { writeArticle, summarize },
  // ...
  run: async function* ({ input, agents }) {
    const article = yield* agents.writeArticle({ text: input.text });
    const summary = yield* agents.summarize({ article });
    return { article, summary };
  },
});
```

## Where to go next

| You want to… | Read |
|---|---|
| Make the next step depend on the result of the last (LLM picks the path) | [Orchestrators](./orchestrators) |
| Pause a step for user approval | [Approvals](./approvals) |
| Retry a step on failure with backoff | [Retries & Errors](./retries-and-errors) |
| Replace the in-memory store with durable storage | [Run Persistence](./run-persistence) |
| See every export's signature | [API reference](../api/ai-orchestration) |

> **Note:** The example app at `examples/ts-react-chat` has a richer end-to-end orchestration demo — `examples/ts-react-chat/src/lib/workflows/orchestrator.ts` plus the matching API route and React UI — that puts workflows, orchestrators, approvals, and refinement together.
