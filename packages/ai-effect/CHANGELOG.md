# @tanstack/ai-effect

## 0.1.1

### Patch Changes

- [#2094](https://github.com/TanStack/ai/pull/2094) [`a07f1dc`](https://github.com/TanStack/ai/commit/a07f1dc3cefc50bc484b5d55cdb757804c6f4065) - Interrupting a `chat` Stream, with `Stream.take` or `Fiber.interrupt`, now runs the middleware `onAbort` hook, and the interrupt completes after the run's teardown.

## 0.1.0

### Minor Changes

- [#2074](https://github.com/TanStack/ai/pull/2074) [`4f2eea7`](https://github.com/TanStack/ai/commit/4f2eea7b4c62c937700c56357a6ab37dfc21264d) - Add `@tanstack/ai-effect`, a new package that runs every TanStack AI activity as an Effect or a Stream and lets you write server tools as Effects.
