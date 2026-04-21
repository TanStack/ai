---
id: ChatMiddlewareConfig
title: ChatMiddlewareConfig
---

# Interface: ChatMiddlewareConfig

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:105](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L105)

Chat configuration that middleware can observe or transform.
This is a subset of the chat engine's effective configuration
that middleware is allowed to modify.

## Properties

### maxTokens?

```ts
optional maxTokens: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:111](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L111)

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:106](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L106)

***

### metadata?

```ts
optional metadata: Record<string, unknown>;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:112](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L112)

***

### modelOptions?

```ts
optional modelOptions: Record<string, unknown>;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:113](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L113)

***

### systemPrompts

```ts
systemPrompts: string[];
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:107](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L107)

***

### temperature?

```ts
optional temperature: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:109](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L109)

***

### tools

```ts
tools: Tool<SchemaInput, SchemaInput, string>[];
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:108](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L108)

***

### topP?

```ts
optional topP: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:110](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L110)
