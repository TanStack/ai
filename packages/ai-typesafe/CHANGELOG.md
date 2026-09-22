# @tanstack/ai-typesafe

## 0.1.1

### Patch Changes

- Updated dependencies [[`796f2b5`](https://github.com/TanStack/ai/commit/796f2b5f7c05debe251ad3ecd4073d8cd119b3db)]:
  - @tanstack/ai@0.58.0

## 0.1.0

### Minor Changes

- [#1419](https://github.com/TanStack/ai/pull/1419) [`04bfd8c`](https://github.com/TanStack/ai/commit/04bfd8c26ce337cca53f3f8d286f14ed0432a329) - Add decide() and TypeSafe Jev evaluate adapters.

  Callers await one decide({ adapter, state, questions }) call.
  Questions use choice(), score(), and boolean(). Answers sit on the result (value, probability, confidence). Usage sits on result.meta.

  Jev transports:
  - @tanstack/ai-typesafe (typesafeDecider)
  - @tanstack/ai-openrouter (openRouterDecider)
  - @tanstack/ai-vercel-gateway (vercelGatewayDecider)
  - @tanstack/ai-cloudflare (cloudflareDecider)

### Patch Changes

- Updated dependencies [[`04bfd8c`](https://github.com/TanStack/ai/commit/04bfd8c26ce337cca53f3f8d286f14ed0432a329), [`254ab5f`](https://github.com/TanStack/ai/commit/254ab5ff5b0a9ca945cb313588f4b56394c7ecf7)]:
  - @tanstack/ai@0.57.0
