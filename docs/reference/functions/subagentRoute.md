---
id: subagentRoute
title: subagentRoute
---

```ts
function subagentRoute<TAgents>(agents, options?): object;
```

Defined in: [packages/ai/src/activities/chat/agents/route.ts:53](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/route.ts#L53)

Build `decide()` questions for a subagent router.

One yes/no question per agent, plus an `order` choice.
`pick` returns `main`, one name, `{ names, order }`, or `{ steps }`.
Names follow the `agents` array order.
`{ names, order }` overrides `subagents.order` for that turn.
`then`: agents that run after the other selected agents. The lead group
starts together. The `then` agents then run one after another in list
order, and each reads the text so far. Used only when the router picks at
least one agent from each group. Otherwise `pick` returns `{ names, order }`.

## Type Parameters

### TAgents

`TAgents` *extends* readonly [`DefinedAgent`](../interfaces/DefinedAgent.md)\<`string`, readonly `SubagentTool`[], [`SchemaInput`](../type-aliases/SchemaInput.md) \| `undefined`, readonly [`InterruptDefinition`](../interfaces/InterruptDefinition.md)\<`any`, `any`, `any`, `any`, `any`\>[]\>[]

## Parameters

### agents

`TAgents`

### options?

[`SubagentRouteOptions`](../interfaces/SubagentRouteOptions.md)\<`TAgents`\>

## Returns

`object`

### pick

```ts
pick: (result) => SubagentRouterPick;
```

#### Parameters

##### result

`RouteAnswers`\<`TAgents`\>

#### Returns

[`SubagentRouterPick`](../type-aliases/SubagentRouterPick.md)

### questions

```ts
questions: RouteQuestions<TAgents>;
```
