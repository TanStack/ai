---
id: UIMessage
title: UIMessage
---

# Interface: UIMessage\<TData\>

Defined in: [packages/ai/src/types.ts:478](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L478)

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
optional createdAt: Date;
```

Defined in: [packages/ai/src/types.ts:482](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L482)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:479](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L479)

***

### parts

```ts
parts: MessagePart<TData>[];
```

Defined in: [packages/ai/src/types.ts:481](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L481)

***

### role

```ts
role: "user" | "assistant" | "system";
```

Defined in: [packages/ai/src/types.ts:480](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L480)
