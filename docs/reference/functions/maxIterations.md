---
id: maxIterations
title: maxIterations
---

# Function: maxIterations()

```ts
function maxIterations(max): AgentLoopStrategy;
```

Defined in: [activities/chat/agent-loop-strategies.ts:20](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/agent-loop-strategies.ts#L20)

Creates a strategy that continues for a maximum number of iterations

## Parameters

### max

`number`

Maximum number of iterations to allow

## Returns

[`AgentLoopStrategy`](../type-aliases/AgentLoopStrategy.md)

AgentLoopStrategy that stops after max iterations

## Example

```typescript
const stream = chat({
  adapter: openaiText(),
  model: "gpt-4o",
  messages: [...],
  tools: [weatherTool],
  agentLoopStrategy: maxIterations(3), // Max 3 iterations
});
```
