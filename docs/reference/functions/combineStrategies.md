---
id: combineStrategies
title: combineStrategies
---

# Function: combineStrategies()

```ts
function combineStrategies(strategies): AgentLoopStrategy;
```

Defined in: [utilities/agent-loop-strategies.ts:79](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/utilities/agent-loop-strategies.ts#L79)

Creates a strategy that combines multiple strategies with AND logic
All strategies must return true to continue

## Parameters

### strategies

[`AgentLoopStrategy`](../type-aliases/AgentLoopStrategy.md)[]

Array of strategies to combine

## Returns

[`AgentLoopStrategy`](../type-aliases/AgentLoopStrategy.md)

AgentLoopStrategy that continues only if all strategies return true

## Example

```typescript
const stream = chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [...],
  tools: [weatherTool],
  agentLoopStrategy: combineStrategies([
    maxIterations(10),
    ({ messages }) => messages.length < 100,
  ]),
});
```
