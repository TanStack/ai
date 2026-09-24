---
id: DefinedAgent
title: DefinedAgent
---

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:50](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L50)

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

## Properties

### description

```ts
description: string;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:59](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L59)

Required here: the router and the synthetic tool both read it.

#### Overrides

```ts
AGUISubagentInfo.description
```

***

### interrupts?

```ts
optional interrupts?: TInterrupts;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:64](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L64)

***

### name

```ts
name: TName;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:57](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L57)

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

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:65](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L65)

***

### run

```ts
run: (ctx) => 
  | AsyncIterable<AGUIEvent, any, any>
| Promise<AsyncIterable<AGUIEvent, any, any>>;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:60](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L60)

#### Parameters

##### ctx

[`SubagentRunContext`](SubagentRunContext.md)

#### Returns

  \| `AsyncIterable`\<[`AGUIEvent`](../type-aliases/AGUIEvent.md), `any`, `any`\>
  \| `Promise`\<`AsyncIterable`\<[`AGUIEvent`](../type-aliases/AGUIEvent.md), `any`, `any`\>\>

***

### subagents?

```ts
optional subagents?: unknown;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:66](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L66)

***

### tools?

```ts
optional tools?: TTools;
```

Defined in: [packages/ai/src/activities/chat/agents/define-agent.ts:63](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/define-agent.ts#L63)
