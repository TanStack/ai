---
id: ChatMiddlewareConfig
title: ChatMiddlewareConfig
---

# Interface: ChatMiddlewareConfig

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:129](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L129)

Chat configuration that middleware can observe or transform.
This is a subset of the chat engine's effective configuration
that middleware is allowed to modify.

## Properties

### maxTokens?

```ts
optional maxTokens: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:135](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L135)

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:130](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L130)

***

### metadata?

```ts
optional metadata: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:136](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L136)

***

### modelOptions?

```ts
optional modelOptions: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:137](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L137)

***

### systemPrompts

```ts
systemPrompts: SystemPrompt[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:131](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L131)

***

### temperature?

```ts
optional temperature: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:133](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L133)

***

### tools

```ts
tools: Tool<SchemaInput, SchemaInput, string, unknown>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:132](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L132)

***

### topP?

```ts
optional topP: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:134](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L134)
