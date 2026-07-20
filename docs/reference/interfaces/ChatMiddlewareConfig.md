---
id: ChatMiddlewareConfig
title: ChatMiddlewareConfig
---

# Interface: ChatMiddlewareConfig

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:207](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L207)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:208](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L208)

***

### metadata?

```ts
optional metadata: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:211](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L211)

***

### modelOptions?

```ts
optional modelOptions: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:212](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L212)

***

### systemPrompts

```ts
systemPrompts: SystemPrompt[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:209](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L209)

***

### tools

```ts
tools: Tool<SchemaInput, SchemaInput, string, unknown>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:210](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L210)
