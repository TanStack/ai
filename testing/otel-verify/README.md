# `@tanstack/ai-otel-verify`

Manual smoke harness for verifying the [`otelMiddleware`](../../packages/typescript/ai/src/middlewares/otel.ts) against real OTLP backends. Boots an in-process [aimock](https://github.com/CopilotKit/aimock), runs three deterministic chat scenarios with the middleware attached, and exports spans + metrics over OTLP/HTTP to whichever backend you point it at.

This package is **`private: true`** — it ships in the repo for ergonomics but is never published to npm. It is **not** part of the automated test suite or CI. Use it when adding a new backend, after material changes to `otelMiddleware`, or to reproduce a user-reported rendering problem.

## Prerequisite: build the workspace

The harness imports `@tanstack/ai/middlewares/otel`, which resolves through the package's `dist/` directory. Build the workspace first so that subpath export exists:

```bash
pnpm build:all
```

Use `pnpm build:all` (Nx topo order) rather than `pnpm --filter @tanstack/ai build` — the latter skips workspace dependencies like `@tanstack/ai-event-client` and surfaces stale-dist type errors in unrelated activities.

## Quick start

```bash
# 1. Start a self-hosted backend (any single service from docker-compose.yml)
docker compose -f testing/otel-verify/docker-compose.yml up jaeger

# 2. Run the harness against it
OTEL_BACKEND=jaeger pnpm --filter @tanstack/ai-otel-verify verify

# 3. Open Jaeger at http://localhost:16686 and look for service
#    "tanstack-ai-otel-verify"
```

## Backends

| `OTEL_BACKEND`   | Mode      | Required env                                                           |
| ---------------- | --------- | ---------------------------------------------------------------------- |
| `jaeger`         | self-host | none                                                                   |
| `phoenix`        | self-host | none                                                                   |
| `langfuse-self`  | self-host | `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`                           |
| `helicone`       | self-host | `HELICONE_API_KEY`                                                     |
| `langfuse-cloud` | SaaS      | `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, optional `LANGFUSE_HOST` |
| `posthog`        | SaaS      | `POSTHOG_API_KEY`, optional `POSTHOG_HOST`                             |
| `sentry`         | SaaS      | `SENTRY_DSN`                                                           |
| `logfire`        | SaaS      | `LOGFIRE_TOKEN`                                                        |
| `traceloop`      | SaaS      | `TRACELOOP_API_KEY`                                                    |
| `datadog`        | SaaS      | `DD_API_KEY`, optional `DD_SITE`                                       |

Any required env var that's missing surfaces a clear error before the SDK starts. See [`src/backends.ts`](src/backends.ts) for the exact endpoint each preset hits.

## Scenarios

Each run sends three traces unless filtered with `SCENARIO=…`:

| ID           | What it exercises                                              | Expected span tree                                       |
| ------------ | -------------------------------------------------------------- | -------------------------------------------------------- |
| `basic-text` | Single-iteration chat with prompt + completion content capture | `chat → iter#0`                                          |
| `with-tool`  | Two-iteration chat with one tool call                          | `chat → iter#0 → execute_tool get_weather` then `iter#1` |
| `error`      | Forced mid-stream throw via a sibling middleware               | `chat → iter#0` with `status=ERROR` and exception event  |

Filter examples:

```bash
SCENARIO=basic-text OTEL_BACKEND=jaeger pnpm verify
SCENARIO=with-tool,error OTEL_BACKEND=langfuse-self pnpm verify
```

## What to look for in each backend's UI

For each backend, screenshot all three scenarios and check:

1. **Span hierarchy** — root `chat` span has child iteration spans; tool spans nest under the iteration that triggered them.
2. **GenAI rendering** — the backend recognises `gen_ai.system`, `gen_ai.request.model`, `gen_ai.response.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens` and shows them somewhere in the UI (chips, sidebar, generation card).
3. **Prompt + completion display** — with `captureContent: true` the harness emits both `gen_ai.input.messages` / `gen_ai.output.messages` attributes (current semconv) and `gen_ai.user.message` / `gen_ai.choice` events (legacy). At least one form should render.
4. **Tool call panel** — `gen_ai.tool.name`, `gen_ai.tool.call.id`, args + result.
5. **Token cost** — most backends derive cost from input/output token counts. Phoenix is the known holdout (uses OpenInference token attrs).
6. **Error rendering** — the `error` scenario should appear as a failed span with the exception message visible.

## Adding a new backend

1. Add a preset to [`src/backends.ts`](src/backends.ts).
2. If self-hostable, add a service to [`docker-compose.yml`](docker-compose.yml).
3. Add a row to the table above.
4. Run all three scenarios and capture screenshots locally.

## Why this isn't an automated test

Most of what we're verifying — "does Langfuse's UI display the tool call card?" — is a render question that needs human eyes. The wire format is already locked down by `packages/typescript/ai/tests/middlewares/otel.test.ts` and the in-process E2E specs in `testing/e2e/tests/middleware.spec.ts`. This harness exists to verify that our wire format is _understood_ by real backends — a one-shot verification, not something CI should run.
