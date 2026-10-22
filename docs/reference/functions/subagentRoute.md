---
id: subagentRoute
title: subagentRoute
---

```ts
function subagentRoute<TAgents>(agents, options?): object;
```

Defined in: packages/ai/src/activities/chat/agents/route.ts:94

Build `decide()` questions for a subagent router.

One yes/no question per agent, plus an `order` choice.
`pick` returns `main`, one name, `{ names, order }`, or `{ steps }`.
Names follow the `agents` array order.
`{ names, order }` overrides `subagents.order` for that turn.
`then`: agents that run after the other selected agents. The lead group
starts together. The `then` agents then run one after another in list
order, and each reads the text so far. Used only when the router picks at
least one agent from each group. Otherwise `pick` returns `{ names, order }`.

An agent with `inputSchema` needs input. `needsInput(result)` lists the
picked agents that need it, with their schemas. Make each input, then pass
them as `pick(result, { inputs })`. Each name with an input becomes
`{ name, input }`. `pick` throws when a picked agent with a schema has no
input.

## Type Parameters

### TAgents

`TAgents` *extends* readonly [`DefinedAgent`](../interfaces/DefinedAgent.md)\<`string`, readonly `SubagentTool`[], [`SchemaInput`](../type-aliases/SchemaInput.md) \| `undefined`, readonly [`InterruptDefinition`](../interfaces/InterruptDefinition.md)\<`any`, `any`, `any`, `any`, `any`\>[], `any`, `unknown`, [`AgentProduces`](../type-aliases/AgentProduces.md) \| `undefined`\>[]

## Parameters

### agents

`TAgents`

### options?

[`SubagentRouteOptions`](../interfaces/SubagentRouteOptions.md)\<`TAgents`\>

## Returns

### needsInput

```ts
needsInput: (result) => InputNeed<TAgents[number]>[];
```

The picked agents that have an `inputSchema`, in agent-list order. Make
an input for each one and pass it to `pick` in `inputs`.

#### Parameters

##### result

`RouteAnswers`\<`TAgents`\>

#### Returns

`InputNeed`\<`TAgents`\[`number`\]\>[]

### pick

```ts
pick: (result, pickOptions?) => SubagentRouterPick;
```

#### Parameters

##### result

`RouteAnswers`\<`TAgents`\>

##### pickOptions?

`RoutePickOptions`\<`TAgents`\>

#### Returns

[`SubagentRouterPick`](../type-aliases/SubagentRouterPick.md)

### questions

```ts
questions: RouteQuestions<TAgents>;
```

## Example

```ts
const route = subagentRoute(agents)
const result = await decide({ adapter, state, questions: route.questions })
const inputs = { pricer: { sku: 'A-1' } }
return route.pick(result, { inputs })
```
