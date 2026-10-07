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

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:78](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L78)

The input the parent model writes when it calls this agent's tool, such
as a short brief. `run` reads it as `ctx.input`. Tool mode only: a
`subagents.router` cannot start an agent that has `inputSchema`.

***

### interrupts?

```ts
optional interrupts?: TInterrupts;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:80](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L80)

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

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:81](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L81)

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

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:82](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L82)

***

### tools?

```ts
optional tools?: TTools;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:79](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L79)
