---
id: SubagentRouteOptions
title: SubagentRouteOptions
---

Defined in: [packages/ai/src/activities/chat/agents/route.ts:7](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/route.ts#L7)

## Type Parameters

### TAgents

`TAgents` *extends* `ReadonlyArray`\<[`DefinedAgent`](DefinedAgent.md)\>

## Properties

### then?

```ts
optional then?: readonly TAgents[number]["name"][];
```

Defined in: [packages/ai/src/activities/chat/agents/route.ts:21](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/route.ts#L21)

Agents that run after the other selected agents. The lead group starts
together. The `then` agents then run one after another in list order, and
each reads the text so far. Used only when the router picks at least one
agent from each group. Otherwise `pick` returns `{ names, order }`.

***

### when?

```ts
optional when?: { [K in string]: string };
```

Defined in: [packages/ai/src/activities/chat/agents/route.ts:14](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/route.ts#L14)

Question text for every agent. The key is the agent name.
Omit this and each question uses that agent's description.
