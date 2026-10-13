---
id: SubagentSink
title: SubagentSink
---

Defined in: [packages/ai/src/activities/chat/agents/spawn.ts:104](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/spawn.ts#L104)

What the children of one parent run left behind for the parent terminal.

## Properties

### interrupts

```ts
interrupts: Interrupt[];
```

Defined in: [packages/ai/src/activities/chat/agents/spawn.ts:105](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/spawn.ts#L105)

***

### total?

```ts
optional total?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/activities/chat/agents/spawn.ts:109](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/spawn.ts#L109)

Summed full usage of the children, including cost.

***

### usage

```ts
usage: TokenUsage[];
```

Defined in: [packages/ai/src/activities/chat/agents/spawn.ts:107](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/spawn.ts#L107)

One AG-UI entry per child model call.
