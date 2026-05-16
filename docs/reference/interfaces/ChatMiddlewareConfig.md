---
id: ChatMiddlewareConfig
title: ChatMiddlewareConfig
---

# Interface: ChatMiddlewareConfig

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:116](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L116)

Chat configuration that middleware can observe or transform.
This is a subset of the chat engine's effective configuration
that middleware is allowed to modify.

## Properties

### maxTokens?

```ts
optional maxTokens: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:122](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L122)

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:117](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L117)

***

### metadata?

```ts
optional metadata: Record<string, unknown>;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:123](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L123)

***

### modelOptions?

```ts
optional modelOptions: Record<string, unknown>;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:124](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L124)

***

### systemPrompts

```ts
systemPrompts: string[];
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:118](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L118)

***

### temperature?

```ts
optional temperature: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:120](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L120)

***

### tools

```ts
tools: Tool<SchemaInput, SchemaInput, string>[];
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:119](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L119)

***

### topP?

```ts
optional topP: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:121](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L121)
