---
id: maxToolCalls
title: maxToolCalls
---

# Function: maxToolCalls()

```ts
function maxToolCalls(max): AgentLoopStrategy;
```

Defined in: [packages/ai/src/activities/chat/agent-loop-strategies.ts:59](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agent-loop-strategies.ts#L59)

Creates a strategy that continues while `toolCallCount < max`.

Unlike [maxIterations](maxIterations.md) (which counts model turns), this bounds
**emitted** tool calls counted during the run (including ones skipped by
`maxToolCallsPerTurn`). Strategies only run between turns, so the turn that
crosses `max` is not truncated — the final count (and executions, unless
`maxToolCallsPerTurn` is set) may exceed `max`. Pair with
`chat({ maxToolCallsPerTurn })` to also cap parallel fan-out inside a single
turn.

## Parameters

### max

`number`

Maximum cumulative emitted tool calls before stopping further turns

## Returns

[`AgentLoopStrategy`](../type-aliases/AgentLoopStrategy.md)

AgentLoopStrategy that returns true while `toolCallCount < max`

## Example

```typescript
import { chat, combineStrategies, maxIterations, maxToolCalls } from '@tanstack/ai'

const stream = chat({
  adapter: openaiText('gpt-4o'),
  messages: [...],
  tools: [weatherTool],
  maxToolCallsPerTurn: 10,
  agentLoopStrategy: combineStrategies([
    maxIterations(20),
    maxToolCalls(20),
  ]),
})
```
