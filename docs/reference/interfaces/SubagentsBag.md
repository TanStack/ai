---
id: SubagentsBag
title: SubagentsBag
---

Defined in: packages/ai/src/activities/chat/agents/spawn.ts:108

## Type Parameters

### TAgents

`TAgents` *extends* `ReadonlyArray`\<[`DefinedAgent`](DefinedAgent.md)\> = `ReadonlyArray`\<[`DefinedAgent`](DefinedAgent.md)\>

## Properties

### agents

```ts
agents: TAgents;
```

Defined in: packages/ai/src/activities/chat/agents/spawn.ts:111

***

### binding?

```ts
optional binding?: SubagentBinding;
```

Defined in: packages/ai/src/activities/chat/agents/spawn.ts:129

What a host adds to every activity call a child makes through `ctx`
(`ctx.chat`, `ctx.generateImage`, and the rest). Apps do not set it.

***

### keys?

```ts
optional keys?: ProviderKeySource;
```

Defined in: packages/ai/src/activities/chat/agents/spawn.ts:145

Provider keys that agents read as `ctx.keys`: an object by provider id,
for example `{ openai: userKey }`, or a function that returns the key of
a provider, for example `(provider) => getByokKey(request, provider)`.
A missing or empty key falls back to the keys of the parent agent, then
to the provider's `env` names. A child's `ctx.chat({ subagents })` passes
them on. The keys it sets itself win for those providers.

***

### limits?

```ts
optional limits?: SubagentLimits;
```

Defined in: packages/ai/src/activities/chat/agents/spawn.ts:136

Limits for the whole tree of children the model starts through tools:
depth, total calls, children at once, and time per child. A refused
start returns to the model as a tool error. Only the root chat's limits
apply: a nested chat in a child uses the root's budget.

***

### order?

```ts
optional order?: "parallel" | "sequence";
```

Defined in: packages/ai/src/activities/chat/agents/spawn.ts:123

How a router list runs. `parallel` starts every name together.
`sequence` runs each name after the previous one finishes, and passes
that child's text to the next child.

***

### router?

```ts
optional router?: (ctx) => 
  | SubagentRouterPick
| Promise<SubagentRouterPick>;
```

Defined in: packages/ai/src/activities/chat/agents/spawn.ts:112

#### Parameters

##### ctx

###### abortSignal?

`AbortSignal`

###### agents

`NoInfer`\<`TAgents`\>

###### messages

(
  \| [`UIMessage`](UIMessage.md)\<`unknown`\>
  \| [`ModelMessage`](ModelMessage.md)\<
  \| `string`
  \| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`, `unknown`\>[]
  \| `null`\>)[]

#### Returns

  \| [`SubagentRouterPick`](../type-aliases/SubagentRouterPick.md)
  \| `Promise`\<[`SubagentRouterPick`](../type-aliases/SubagentRouterPick.md)\>

***

### sandbox?

```ts
optional sandbox?: "own" | "inherit";
```

Defined in: packages/ai/src/activities/chat/agents/spawn.ts:124

***

### strategy?

```ts
optional strategy?: "exclusive" | "handoff";
```

Defined in: packages/ai/src/activities/chat/agents/spawn.ts:117
