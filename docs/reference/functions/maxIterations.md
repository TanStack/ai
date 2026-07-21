---
id: maxIterations
title: maxIterations
---

# Function: maxIterations()

```ts
function maxIterations(max): AgentLoopStrategy;
```

Defined in: [packages/ai/src/activities/chat/agent-loop-strategies.ts:25](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agent-loop-strategies.ts#L25)

Creates a strategy that continues for a maximum number of **model turns**
(iterations), not tool calls.

One iteration can still emit many parallel tool calls. Prefer middleware
with `onBeforeToolCall` / `onShouldContinue` when you need a tool-call
budget (see the Agentic Cycle docs recipe).

## Parameters

### max

`number`

Maximum number of model turns to allow

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
  agentLoopStrategy: maxIterations(3), // Max 3 model turns
});
```
