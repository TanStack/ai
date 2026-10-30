---
id: SubagentBinding
title: SubagentBinding
---

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:117](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L117)

**`Internal`**

What a host adds to every activity call an agent makes through `ctx`. Apps
using plain `chat({ subagents })` do not set it.

 For hosts that run agents, such as `@tanstack/ai-harness`.

## Properties

### budget?

```ts
optional budget?: SubagentBudget;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:148](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L148)

The subagent tree budget. A child's `ctx.chat({ subagents })` passes it
down, so limits hold across the whole tree.

***

### chatMiddleware?

```ts
optional chatMiddleware?: readonly AnyChatMiddleware[];
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:122](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L122)

Added before the call's own middleware on every `ctx.chat` call. A
child's `ctx.chat({ subagents })` passes it down to its own children.

***

### debug?

```ts
optional debug?: DebugOption;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:165](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L165)

The `debug` option for the model calls of a child agent that set no
`debug` of their own. A child's `ctx.chat({ subagents })` passes it down
to its own children.

***

### extend?

```ts
optional extend?: (ctx) => Partial<SubagentContextExtension>;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:170](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L170)

Adds fields to the `ctx` of every run. A host declares their types by
augmenting `SubagentContextExtension`. It passes down to nested children.

#### Parameters

##### ctx

[`SubagentRunContext`](../type-aliases/SubagentRunContext.md)

#### Returns

`Partial`\<[`SubagentContextExtension`](SubagentContextExtension.md)\>

***

### generationMiddleware?

```ts
optional generationMiddleware?: readonly GenerationMiddleware<unknown>[];
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:134](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L134)

Added before the call's own middleware on every generation call. A
child's `ctx.chat({ subagents })` passes it down to its own children.

***

### interrupts?

```ts
optional interrupts?: readonly InterruptDefinition<any, any, any, any, any>[];
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:143](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L143)

Interrupt definitions added to every `ctx.chat` call, so the host
middleware in `chatMiddleware` can stop the child with them. The call's
own `interrupts` (for example, the agent's own definitions) win: a host
definition with the same id is not added. A child's
`ctx.chat({ subagents })` passes them down to its own children. A plain
`chat()` call does not get them.

***

### keys?

```ts
optional keys?: ProviderKeys;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:154](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L154)

The provider keys an agent reads as `ctx.keys`. `subagents.keys` sets
them. A child's `ctx.chat({ subagents })` passes them down to its own
children. Without them, `ctx.keys` reads each provider's `env` names.

***

### lastChatMiddleware?

```ts
optional lastChatMiddleware?: readonly AnyChatMiddleware[];
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:129](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L129)

Added after the call's own middleware on every `ctx.chat` call, so it
sees the final config and tool results (for example a host middleware
that scrubs secrets or logs results). A child's `ctx.chat({ subagents })`
passes it down to its own children, after their own.

***

### promptCache?

```ts
optional promptCache?: PromptCacheRetention;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:159](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L159)

The prompt cache retention of the parent call. A child's `ctx.chat()`
uses it when the call gives no `promptCache`.

***

### start?

```ts
optional start?: (call, options) => Promise<{
  done: Promise<unknown>;
  subagentRunId: string;
}>;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:177](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L177)

Starts a child without waiting for it and returns its id at once. The
agent tools call it for `background: true`. With
`wake: true`, the host starts a new parent turn when the child ends. It
does not pass down to nested children.

#### Parameters

##### call

###### agent

`string`

###### input?

`unknown`

###### parentToolCallId?

`string`

###### prompt?

`string`

##### options

###### wake

`true`

#### Returns

`Promise`\<\{
  `done`: `Promise`\<`unknown`\>;
  `subagentRunId`: `string`;
\}\>
