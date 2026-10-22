---
id: SubagentLimits
title: SubagentLimits
---

Defined in: packages/ai/src/activities/chat/agents/limits.ts:5

Limits for a whole subagent tree. The root run makes one budget, and every
child shares it, so a child cannot reset it.

## Properties

### maxCalls?

```ts
optional maxCalls?: number;
```

Defined in: packages/ai/src/activities/chat/agents/limits.ts:11

How many children the whole tree may start.

***

### maxConcurrent?

```ts
optional maxConcurrent?: number;
```

Defined in: packages/ai/src/activities/chat/agents/limits.ts:9

How many children one run may have running at once.

***

### maxDepth?

```ts
optional maxDepth?: number;
```

Defined in: packages/ai/src/activities/chat/agents/limits.ts:7

How deep the tree may grow. The root run is depth 0.

***

### timeoutMs?

```ts
optional timeoutMs?: number;
```

Defined in: packages/ai/src/activities/chat/agents/limits.ts:13

How long one child may run. Never later than its parent's own deadline.
