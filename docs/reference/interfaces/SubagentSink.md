---
id: SubagentSink
title: SubagentSink
---

Defined in: packages/ai/src/activities/chat/agents/spawn.ts:205

What the children of one parent run left behind for the parent terminal.

## Properties

### interrupts

```ts
interrupts: Interrupt[];
```

Defined in: packages/ai/src/activities/chat/agents/spawn.ts:206

***

### total?

```ts
optional total?: TokenUsage<ProviderUsageDetails>;
```

Defined in: packages/ai/src/activities/chat/agents/spawn.ts:210

Summed full usage of the children, including cost.

***

### usage

```ts
usage: TokenUsage[];
```

Defined in: packages/ai/src/activities/chat/agents/spawn.ts:208

One AG-UI entry per child model call.
