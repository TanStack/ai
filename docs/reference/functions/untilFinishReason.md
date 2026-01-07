---
id: untilFinishReason
title: untilFinishReason
---

# Function: untilFinishReason()

```ts
function untilFinishReason(stopReasons): AgentLoopStrategy;
```

Defined in: [activities/chat/agent-loop-strategies.ts:41](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/agent-loop-strategies.ts#L41)

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
  adapter: openaiText(),
  model: "gpt-4o",
  messages: [...],
  tools: [weatherTool],
  agentLoopStrategy: untilFinishReason(["stop", "length"]),
});
```
