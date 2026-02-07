---
id: AgentLoopStrategy
title: AgentLoopStrategy
---

# Type Alias: AgentLoopStrategy()

```ts
type AgentLoopStrategy = (state) => boolean;
```

Defined in: [types.ts:592](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L592)

Strategy function that determines whether the agent loop should continue

## Parameters

### state

[`AgentLoopState`](../interfaces/AgentLoopState.md)

Current state of the agent loop

## Returns

`boolean`

true to continue looping, false to stop

## Example

```typescript
// Continue for up to 5 iterations
const strategy: AgentLoopStrategy = ({ iterationCount }) => iterationCount < 5;
```
