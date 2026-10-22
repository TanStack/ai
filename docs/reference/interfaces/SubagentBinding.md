---
id: SubagentBinding
title: SubagentBinding
---

Defined in: packages/ai/src/activities/chat/agents/bound.ts:108

What a host adds to every activity call an agent makes through `ctx`. Apps
using plain `chat({ subagents })` do not set it.

## Properties

### budget?

```ts
optional budget?: SubagentBudget;
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:123

The subagent tree budget. A child's `ctx.chat({ subagents })` passes it
down, so limits hold across the whole tree.

***

### chatMiddleware?

```ts
optional chatMiddleware?: readonly AnyChatMiddleware[];
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:113

Added before the call's own middleware on every `ctx.chat` call. A
child's `ctx.chat({ subagents })` passes it down to its own children.

***

### generationMiddleware?

```ts
optional generationMiddleware?: readonly GenerationMiddleware<unknown>[];
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:118

Added before the call's own middleware on every generation call. A
child's `ctx.chat({ subagents })` passes it down to its own children.

***

### keys?

```ts
optional keys?: ProviderKeys;
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:129

The provider keys an agent reads as `ctx.keys`. `subagents.keys` sets
them. A child's `ctx.chat({ subagents })` passes them down to its own
children. Without them, `ctx.keys` reads each provider's `env` names.

***

### promptCache?

```ts
optional promptCache?: PromptCacheRetention;
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:134

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

Defined in: packages/ai/src/activities/chat/agents/bound.ts:141

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
