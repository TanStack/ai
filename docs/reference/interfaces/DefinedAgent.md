---
id: DefinedAgent
title: DefinedAgent
---

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:101](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L101)

A named child agent. `run` is a `chat()` call (or any stream of AG-UI
chunks), or a promise of a plain value such as an image result. A
`chat({ stream: false })` result counts as its text.
`TTools` and `TSchema` stay on the object so `useChat({ subagents })` can
type that child's parts. `TResult` is the value a promise `run` resolves to.

## Extends

- `SubagentInfo`

## Type Parameters

### TName

`TName` *extends* `string` = `string`

### TTools

`TTools` *extends* `ReadonlyArray`\<`SubagentTool`\> = `ReadonlyArray`\<`SubagentTool`\>

### TSchema

`TSchema` *extends* [`SchemaInput`](../type-aliases/SchemaInput.md) \| `undefined` = [`SchemaInput`](../type-aliases/SchemaInput.md) \| `undefined`

### TInterrupts

`TInterrupts` *extends* `ReadonlyArray`\<[`InterruptDefinition`](InterruptDefinition.md)\<`any`, `any`, `any`, `any`\>\> = `ReadonlyArray`\<[`InterruptDefinition`](InterruptDefinition.md)\<`any`, `any`, `any`, `any`\>\>

### TInput

`TInput` *extends* [`SchemaInput`](../type-aliases/SchemaInput.md) \| `undefined` = `any`

### TResult

`TResult` = `unknown`

### TProduces

`TProduces` *extends* [`AgentProduces`](../type-aliases/AgentProduces.md) \| `undefined` = [`AgentProduces`](../type-aliases/AgentProduces.md) \| `undefined`

## Properties

### description

```ts
description: string;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:113](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L113)

Required here: the router and the synthetic tool both read it.

#### Overrides

```ts
AGUISubagentInfo.description
```

***

### inputSchema?

```ts
optional inputSchema?: TInput;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:133](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L133)

The input this agent needs, such as a short brief. `run` reads it as
`ctx.input`, and the client card as `part.subagent.input`. In tool mode,
the parent model writes it when it calls this agent's tool. Without it,
the tool takes a text `prompt`. When the run uses `sessionId` or
`background`, that name is reserved. A `subagents.router` gives it in
its pick as `{ name, input }`. The input is checked against this schema
first. A router can start this agent only when the schema is a Standard
Schema, such as a zod schema. A plain JSON Schema works in tool mode
only. A turn with a router input cannot resume after an interrupt.

***

### interrupts?

```ts
optional interrupts?: TInterrupts;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:135](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L135)

***

### name

```ts
name: TName;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:111](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L111)

Unique name or identifier of the subagent.

#### Overrides

```ts
AGUISubagentInfo.name
```

***

### outputSchema?

```ts
optional outputSchema?: TSchema;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:136](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L136)

***

### produces?

```ts
optional produces?: TProduces;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:121](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L121)

What this agent makes. See [AgentProduces](../type-aliases/AgentProduces.md).

***

### run

```ts
run: (ctx) => 
  | AsyncIterable<AGUIEvent, any, any>
  | Promise<AsyncIterable<AGUIEvent, any, any>>
| Promise<TResult>;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:114](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L114)

#### Parameters

##### ctx

[`SubagentRunContext`](../type-aliases/SubagentRunContext.md)\<`TInput`\>

#### Returns

  \| `AsyncIterable`\<[`AGUIEvent`](../type-aliases/AGUIEvent.md), `any`, `any`\>
  \| `Promise`\<`AsyncIterable`\<[`AGUIEvent`](../type-aliases/AGUIEvent.md), `any`, `any`\>\>
  \| `Promise`\<`TResult`\>

***

### subagents?

```ts
optional subagents?: unknown;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:137](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L137)

***

### tools?

```ts
optional tools?: TTools;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:134](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L134)
