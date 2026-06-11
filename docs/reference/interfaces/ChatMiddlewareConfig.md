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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:133](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L133)

***

### modelOptions?

```ts
optional modelOptions: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:134](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L134)

***

### systemPrompts

```ts
systemPrompts: SystemPrompt[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:131](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L131)

***

### tools

```ts
tools: Tool<SchemaInput, SchemaInput, string, unknown>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:132](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L132)
