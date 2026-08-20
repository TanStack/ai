---
id: maxIterations
title: maxIterations
---

# Function: maxIterations()

```ts
function maxIterations(max): AgentLoopStrategy;
```

Defined in: [packages/ai/src/activities/chat/agent-loop-strategies.ts:26](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agent-loop-strategies.ts#L26)

Creates a strategy that continues for a maximum number of **model turns**
(iterations), not tool calls.

One iteration can still emit many parallel tool calls. For a tool-call
budget, use middleware with `onBeforeToolCall` (per-turn cap) and
`onShouldContinue` (cumulative run budget) — see the docs recipe under
Agentic Cycle.

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
