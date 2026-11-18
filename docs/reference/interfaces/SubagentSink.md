---
id: SubagentSink
title: SubagentSink
---

Defined in: [packages/ai/src/activities/chat/agents/spawn.ts:223](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/spawn.ts#L223)

What the children of one parent run left behind for the parent terminal.

## Properties

### interrupts

```ts
interrupts: Interrupt[];
```

Defined in: [packages/ai/src/activities/chat/agents/spawn.ts:224](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/spawn.ts#L224)

***

### total?

```ts
optional total?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/activities/chat/agents/spawn.ts:228](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/spawn.ts#L228)

Summed full usage of the children, including cost.

***

### usage

```ts
usage: TokenUsage[];
```

Defined in: [packages/ai/src/activities/chat/agents/spawn.ts:226](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/spawn.ts#L226)

One AG-UI entry per child model call.
