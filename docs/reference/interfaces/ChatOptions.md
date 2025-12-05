---
id: ChatOptions
title: ChatOptions
---

# Interface: ChatOptions\<TModel, TProviderOptionsSuperset, TOutput, TProviderOptionsForModel, TContext\>

Defined in: [types.ts:495](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L495)

Options passed into the SDK and further piped to the AI provider.

## Type Parameters

### TModel

`TModel` *extends* `string` = `string`

### TProviderOptionsSuperset

`TProviderOptionsSuperset` *extends* `Record`\<`string`, `any`\> = `Record`\<`string`, `any`\>

### TOutput

`TOutput` *extends* [`ResponseFormat`](ResponseFormat.md)\<`any`\> \| `undefined` = `undefined`

### TProviderOptionsForModel

`TProviderOptionsForModel` = `TProviderOptionsSuperset`

### TContext

`TContext` = `unknown`

## Properties

### abortController?

```ts
optional abortController: AbortController;
```

Defined in: [types.ts:529](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L529)

AbortController for request cancellation.

Allows you to cancel an in-progress request using an AbortController.
Useful for implementing timeouts or user-initiated cancellations.

#### Example

```ts
const abortController = new AbortController();
setTimeout(() => abortController.abort(), 5000); // Cancel after 5 seconds
await chat({ ..., abortController });
```

#### See

https://developer.mozilla.org/en-US/docs/Web/API/AbortController

***

### agentLoopStrategy?

```ts
optional agentLoopStrategy: AgentLoopStrategy;
```

Defined in: [types.ts:506](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L506)

***

### context?

```ts
optional context: TContext;
```

Defined in: [types.ts:552](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L552)

Context object that is automatically passed to all tool execute functions.

This allows tools to access shared context (like user ID, database connections,
request metadata, etc.) without needing to capture them via closures.
Works for both server and client tools.

#### Example

```ts
const stream = chat({
  adapter: openai(),
  model: 'gpt-4o',
  messages,
  context: { userId: '123', db },
  tools: [getUserData],
});

// In tool definition:
const getUserData = getUserDataDef.server(async (args, options) => {
  // options.context.userId and options.context.db are available
  return await options.context.db.users.find({ userId: options.context.userId });
});
```

***

### conversationId?

```ts
optional conversationId: string;
```

Defined in: [types.ts:515](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L515)

Conversation ID for correlating client and server-side devtools events.
When provided, server-side events will be linked to the client conversation in devtools.

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [types.ts:503](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L503)

***

### model

```ts
model: TModel;
```

Defined in: [types.ts:502](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L502)

***

### options?

```ts
optional options: CommonOptions;
```

Defined in: [types.ts:507](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L507)

***

### output?

```ts
optional output: TOutput;
```

Defined in: [types.ts:510](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L510)

***

### providerOptions?

```ts
optional providerOptions: TProviderOptionsForModel;
```

Defined in: [types.ts:508](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L508)

***

### request?

```ts
optional request: Request | RequestInit;
```

Defined in: [types.ts:509](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L509)

***

### systemPrompts?

```ts
optional systemPrompts: string[];
```

Defined in: [types.ts:505](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L505)

***

### tools?

```ts
optional tools: Tool<ZodType<unknown, unknown, $ZodTypeInternals<unknown, unknown>>, ZodType<unknown, unknown, $ZodTypeInternals<unknown, unknown>>, string>[];
```

Defined in: [types.ts:504](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L504)
