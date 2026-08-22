---
id: UIMessage
title: UIMessage
---

# Interface: UIMessage\<TData\>

Defined in: [packages/ai/src/types.ts:520](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L520)

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

Defined in: [packages/ai/src/types.ts:524](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L524)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:521](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L521)

***

### parts

```ts
parts: MessagePart<TData>[];
```

Defined in: [packages/ai/src/types.ts:523](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L523)

***

### role

```ts
role: "user" | "assistant" | "system";
```

Defined in: [packages/ai/src/types.ts:522](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L522)
