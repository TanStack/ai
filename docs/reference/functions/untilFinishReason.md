---
id: untilFinishReason
title: untilFinishReason
---

```ts
function untilFinishReason(stopReasons): AgentLoopStrategy;
```

Defined in: packages/ai/src/activities/chat/agent-loop-strategies.ts:47

Creates a strategy that continues until a specific finish reason is encountered

## Parameters

### stopReasons

`string`[]

Finish reasons that should stop the loop

## Returns

[`AgentLoopStrategy`](../type-aliases/AgentLoopStrategy.md)

AgentLoopStrategy that stops on specific finish reasons

## Example

```typescript
const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  threadId: "thread-1",
  messages: [...],
  tools: [weatherTool],
  agentLoopStrategy: untilFinishReason(["stop", "length"]),
});
```
