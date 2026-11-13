# Solid 2 adapter consumer tests

Run `pnpm --filter @tanstack/ai-solid2-e2e test:e2e` from the repository root.

This private harness compiles a Solid 2 app with `@solidjs/vite-plugin`. Playwright drives Chromium against the production Vite build.

The app imports `useChat` from the public `@tanstack/ai-solid2` root entry. There is no source alias or replacement for the adapter or `ChatClient`.

## Setup

1. Use the Node and pnpm versions from the repository contribution guide.
2. Run `pnpm install` from the repository root.
3. If Chromium is missing, run `pnpm --filter @tanstack/ai-solid2-e2e exec playwright install chromium`.
4. Run `pnpm --filter @tanstack/ai-solid2-e2e test:e2e`.

The test command builds the adapter and its workspace dependencies first. Playwright then builds and serves this app on `127.0.0.1:3012`.

## Scope

- Partial and final streamed messages from the compiled public entry.
- Reactive `forwardedProps` without transcript loss.
- Reactive `threadId` with old-stream cancellation and fresh chat state.
- Owner disposal with stream cancellation, no late finish callback, and a fresh remount.
- Draft input and focus retained when a message part receives a streaming update through the public `/ui` entry.

The transport emits deterministic test fixtures, not recorded or live AI responses. A button releases the final chunk, so assertions do not depend on timing. No provider API key is required.

The harness has its own Solid 2 dependencies. The [main E2E app](../e2e/README.md) keeps its Solid 1 runtime.

## Type checks

```bash
pnpm --filter @tanstack/ai-solid2-e2e test:types
```

This checks the app and Playwright tests against actual package declarations. The browser tests pass when replies stream, options update, and cleanup leaves no active fixture stream.
