---
id: ChatMiddlewareConfig
title: ChatMiddlewareConfig
---

# Interface: ChatMiddlewareConfig

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:194](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L194)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:195](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L195)

***

### metadata?

```ts
optional metadata: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:198](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L198)

***

### modelOptions?

```ts
optional modelOptions: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:199](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L199)

***

### systemPrompts

```ts
systemPrompts: SystemPrompt[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:196](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L196)

***

### tools

```ts
tools: Tool<SchemaInput, SchemaInput, string, unknown>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:197](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L197)
