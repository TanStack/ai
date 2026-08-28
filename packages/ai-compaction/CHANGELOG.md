# @tanstack/ai-compaction

## 0.1.0

### Minor Changes

- [#1235](https://github.com/TanStack/ai/pull/1235) [`e04ff6a`](https://github.com/TanStack/ai/commit/e04ff6abcb86c5ede17cd8c1c96df82e9aae03d7) - Add `@tanstack/ai-compaction` — context-window compaction as a `chat()`
  middleware. `withCompaction({ maxTokens, strategy })` runs a pluggable
  `CompactionStrategy` before each model call, so compaction is incremental and
  rolling. Three strategies ship built in: `evictOldest` (drop old messages, the
  default), `summarizeOldest` (replace them with an LLM summary), and
  `clearToolResults` (stub old tool output, keep the messages). Combine them with
  `composeStrategies`, which escalates through strategies until the transcript is
  back under budget. Strategies preserve tool-call/result pairing and never touch
  the system prompt.

- [#1235](https://github.com/TanStack/ai/pull/1235) [`e04ff6a`](https://github.com/TanStack/ai/commit/e04ff6abcb86c5ede17cd8c1c96df82e9aae03d7) - Show compaction in TanStack AI DevTools. `withCompaction` injects
  `compaction:started`, `compaction:state`, and `compaction:ended` CUSTOM
  stream events. State includes before/after counts, the token budget, and
  dropped vs sent message previews. The chat client re-emits the same three
  events. The AI panel has a Compaction tab and started/state/ended steps on
  the iteration.

- [#1235](https://github.com/TanStack/ai/pull/1235) [`e04ff6a`](https://github.com/TanStack/ai/commit/e04ff6abcb86c5ede17cd8c1c96df82e9aae03d7) - Keep canonical chat history separate from compacted provider context. Reuse
  validated compaction checkpoints through an optional persistence metadata store.

### Patch Changes

- [#1235](https://github.com/TanStack/ai/pull/1235) [`e04ff6a`](https://github.com/TanStack/ai/commit/e04ff6abcb86c5ede17cd8c1c96df82e9aae03d7) - Add `ctx.emitCustomEvent` on chat middleware context. The engine yields
  `CUSTOM` chunks while hooks such as `onConfig` are still running, so a long
  middleware step can send progress before it finishes. Compaction uses this
  to emit `compaction:started` before the strategy returns.
- Updated dependencies [[`49fc54c`](https://github.com/TanStack/ai/commit/49fc54ca0aacf2fc60bb36647a61a23559dda4bc), [`e04ff6a`](https://github.com/TanStack/ai/commit/e04ff6abcb86c5ede17cd8c1c96df82e9aae03d7), [`e04ff6a`](https://github.com/TanStack/ai/commit/e04ff6abcb86c5ede17cd8c1c96df82e9aae03d7)]:
  - @tanstack/ai@0.52.0
