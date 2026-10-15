---
id: DefinedAgent
title: DefinedAgent
---

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:59](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L59)

A named child agent. `run` is a `chat()` call (or any stream of AG-UI chunks).
`TTools` and `TSchema` stay on the object so `useChat({ subagents })` can
type that child's parts.

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

## Properties

### description

```ts
description: string;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:69](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L69)

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

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:82](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L82)

The input this agent needs, such as a short brief. `run` reads it as
`ctx.input`. In tool mode, the parent model writes it when it calls this
agent's tool. A `subagents.router` gives it in its pick as
`{ name, input }`. The input is checked against this schema first. A
router can start this agent only when the schema is a Standard Schema,
such as a zod schema. A plain JSON Schema works in tool mode only. A
turn with a router input cannot resume after an interrupt.

***

### interrupts?

```ts
optional interrupts?: TInterrupts;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:84](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L84)

***

### name

```ts
name: TName;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:67](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L67)

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

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:85](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L85)

***

### run

```ts
run: (ctx) => 
  | AsyncIterable<AGUIEvent, any, any>
| Promise<AsyncIterable<AGUIEvent, any, any>>;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:70](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L70)

#### Parameters

##### ctx

[`SubagentRunContext`](SubagentRunContext.md)\<`TInput`\>

#### Returns

  \| `AsyncIterable`\<[`AGUIEvent`](../type-aliases/AGUIEvent.md), `any`, `any`\>
  \| `Promise`\<`AsyncIterable`\<[`AGUIEvent`](../type-aliases/AGUIEvent.md), `any`, `any`\>\>

***

### subagents?

```ts
optional subagents?: unknown;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:86](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L86)

***

### tools?

```ts
optional tools?: TTools;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:83](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L83)
