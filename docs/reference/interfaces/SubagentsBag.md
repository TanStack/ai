---
id: SubagentsBag
title: SubagentsBag
---

Defined in: [packages/ai/src/activities/chat/agents/spawn.ts:84](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/spawn.ts#L84)

## Type Parameters

### TAgents

`TAgents` *extends* `ReadonlyArray`\<[`DefinedAgent`](DefinedAgent.md)\> = `ReadonlyArray`\<[`DefinedAgent`](DefinedAgent.md)\>

## Properties

### agents

```ts
agents: TAgents;
```

Defined in: [packages/ai/src/activities/chat/agents/spawn.ts:87](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/spawn.ts#L87)

***

### order?

```ts
optional order?: "parallel" | "sequence";
```

Defined in: [packages/ai/src/activities/chat/agents/spawn.ts:99](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/spawn.ts#L99)

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

Defined in: [packages/ai/src/activities/chat/agents/spawn.ts:88](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/spawn.ts#L88)

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

Defined in: [packages/ai/src/activities/chat/agents/spawn.ts:100](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/spawn.ts#L100)

***

### strategy?

```ts
optional strategy?: "exclusive" | "handoff";
```

Defined in: [packages/ai/src/activities/chat/agents/spawn.ts:93](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/spawn.ts#L93)
