---
id: ChatMiddlewareConfig
title: ChatMiddlewareConfig
---

# Interface: ChatMiddlewareConfig

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:126](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L126)

Chat configuration that middleware can observe or transform.
This is a subset of the chat engine's effective configuration
that middleware is allowed to modify.

## Extended by

- [`StructuredOutputMiddlewareConfig`](StructuredOutputMiddlewareConfig.md)

## Properties

### maxTokens?

```ts
optional maxTokens: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:132](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L132)

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:127](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L127)

***

### metadata?

```ts
optional metadata: Record<string, unknown>;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:133](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L133)

***

### modelOptions?

```ts
optional modelOptions: Record<string, unknown>;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:134](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L134)

***

### systemPrompts

```ts
systemPrompts: SystemPrompt[];
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:128](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L128)

***

### temperature?

```ts
optional temperature: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:130](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L130)

***

### tools

```ts
tools: Tool<SchemaInput, SchemaInput, string>[];
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:129](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L129)

***

### topP?

```ts
optional topP: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:131](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L131)
