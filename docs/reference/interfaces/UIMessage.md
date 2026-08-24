---
id: UIMessage
title: UIMessage
---

# Interface: UIMessage\<TData\>

Defined in: [packages/ai/src/types.ts:560](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L560)

UIMessage - Domain-specific message format optimized for building chat UIs
Contains parts that can be text, tool calls, or tool results. Generic over
the structured-output data type so `useChat({ outputSchema })`'s schema
narrows `parts.find(p => p.type === 'structured-output').data` on the
consumer side without manual casts.

## Type Parameters

### TData

`TData` = `unknown`

## Properties

### createdAt?

```ts
optional createdAt?: Date;
```

Defined in: [packages/ai/src/types.ts:564](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L564)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:561](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L561)

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/types.ts:573](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L573)

Optional AG-UI sender name. Converters preserve it across wire and persist.

***

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:569](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L569)

Optional AG-UI metadata bag. TanStack writes the `tanstack` key.
User keys stay at the top.

***

### parts

```ts
parts: MessagePart<TData>[];
```

Defined in: [packages/ai/src/types.ts:563](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L563)

***

### role

```ts
role: "user" | "assistant" | "system";
```

Defined in: [packages/ai/src/types.ts:562](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L562)
