---
'@tanstack/ai': minor
---

Rework tool-call fan-out budgets as middleware hooks (unreleased #965 API).

- **Remove** (never released): `maxToolCalls()` strategy and `chat({ maxToolCallsPerTurn })`
- **Add** `onShouldContinue` middleware hook so policies can stop further agent turns without aborting
- **Keep** `AgentLoopState.toolCallCount` / `lastTurnToolCallCount` for strategies and middleware
- Tool-call budgets are an **app-owned middleware recipe** (docs), not a built-in export

```ts
import { chat, maxIterations, type ChatMiddleware } from '@tanstack/ai'

function toolCallBudget({
  max,
  maxPerTurn,
}: {
  max?: number
  maxPerTurn?: number
}): ChatMiddleware {
  let perTurn = 0
  return {
    onIteration: () => {
      perTurn = 0
    },
    onToolPhaseComplete: () => {
      perTurn = 0
    },
    onBeforeToolCall: () => {
      if (maxPerTurn == null) return
      if (++perTurn > maxPerTurn) {
        return {
          type: 'skip',
          result: {
            error: `Skipped: exceeded maxToolCallsPerTurn (${maxPerTurn})`,
          },
        }
      }
    },
    onShouldContinue: (_ctx, state) =>
      max != null && state.toolCallCount >= max ? false : undefined,
  }
}

chat({
  adapter,
  messages,
  tools,
  agentLoopStrategy: maxIterations(20),
  middleware: [toolCallBudget({ maxPerTurn: 10, max: 20 })],
})
```
