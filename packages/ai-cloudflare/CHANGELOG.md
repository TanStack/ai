# @tanstack/ai-cloudflare

## 0.1.5

### Patch Changes

- Updated dependencies [[`796f2b5`](https://github.com/TanStack/ai/commit/796f2b5f7c05debe251ad3ecd4073d8cd119b3db)]:
  - @tanstack/ai@0.58.0
  - @tanstack/openai-base@0.10.15

## 0.1.4

### Patch Changes

- [#1419](https://github.com/TanStack/ai/pull/1419) [`04bfd8c`](https://github.com/TanStack/ai/commit/04bfd8c26ce337cca53f3f8d286f14ed0432a329) - Add decide() and TypeSafe Jev evaluate adapters.

  Callers await one decide({ adapter, state, questions }) call.
  Questions use choice(), score(), and boolean(). Answers sit on the result (value, probability, confidence). Usage sits on result.meta.

  Jev transports:
  - @tanstack/ai-typesafe (typesafeDecider)
  - @tanstack/ai-openrouter (openRouterDecider)
  - @tanstack/ai-vercel-gateway (vercelGatewayDecider)
  - @tanstack/ai-cloudflare (cloudflareDecider)

- Updated dependencies [[`04bfd8c`](https://github.com/TanStack/ai/commit/04bfd8c26ce337cca53f3f8d286f14ed0432a329), [`254ab5f`](https://github.com/TanStack/ai/commit/254ab5ff5b0a9ca945cb313588f4b56394c7ecf7)]:
  - @tanstack/ai@0.57.0
  - @tanstack/openai-base@0.10.14

## 0.1.3

### Patch Changes

- Updated dependencies [[`7c4b25e`](https://github.com/TanStack/ai/commit/7c4b25ebefc64e4f209c282788f515939eca02e9), [`f60f736`](https://github.com/TanStack/ai/commit/f60f73612dd7621e2f1ad76abb1a640307dea3c6)]:
  - @tanstack/ai@0.56.0
  - @tanstack/openai-base@0.10.13

## 0.1.2

### Patch Changes

- Updated dependencies [[`fa13446`](https://github.com/TanStack/ai/commit/fa13446fab9b9048de9433a5ebf55bc626f5fd74), [`0945a79`](https://github.com/TanStack/ai/commit/0945a79b0923b31a5122d0bf28c115879341a410)]:
  - @tanstack/ai@0.55.0
  - @tanstack/openai-base@0.10.12

## 0.1.1

### Patch Changes

- Updated dependencies [[`c17bc95`](https://github.com/TanStack/ai/commit/c17bc951ca783d8023bf54d69035c19c0c72ea2f), [`53e2ec0`](https://github.com/TanStack/ai/commit/53e2ec082b40d8c3fcd09f408c29f0b895436198), [`6269eff`](https://github.com/TanStack/ai/commit/6269eff90e770205ffd9cae8c5989b8ff02b57ce)]:
  - @tanstack/ai@0.54.0
  - @tanstack/openai-base@0.10.11

## 0.1.0

### Minor Changes

- [#1309](https://github.com/TanStack/ai/pull/1309) [`21775ee`](https://github.com/TanStack/ai/commit/21775ee2d23dd594cdc184678ff587341bd74871) - Add `@tanstack/ai-cloudflare`: a Cloudflare adapter for Workers AI chat, summarization, embeddings, image generation, text-to-speech, and transcription over the `env.AI` binding or the REST API, with AI Gateway routing (`gateway` option and `cloudflareGateway()` helper for other providers). `@tanstack/ai` learns the `cloudflare` max-tokens key for summarize, lets `defineByokProvider` declare companion credentials with `with`, and adds `getByokKeys(request, { name: provider })` to `@tanstack/ai/byok/server`. `@tanstack/ai-client`'s `defineByok` takes `providers`: a send for a provider with companions (Cloudflare token plus account id) carries every `x-byok-*` header and prompts for each missing value.

### Patch Changes

- Updated dependencies [[`21775ee`](https://github.com/TanStack/ai/commit/21775ee2d23dd594cdc184678ff587341bd74871)]:
  - @tanstack/ai@0.53.0
  - @tanstack/openai-base@0.10.10
