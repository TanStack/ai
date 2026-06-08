---
id: UIMessage
title: UIMessage
---

# Interface: UIMessage\<TData\>

Defined in: [packages/ai/src/types.ts:436](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L436)

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

Defined in: [packages/ai/src/types.ts:440](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L440)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:437](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L437)

***

### parts

```ts
parts: MessagePart<TData>[];
```

Defined in: [packages/ai/src/types.ts:439](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L439)

***

### role

```ts
role: "user" | "assistant" | "system";
```

Defined in: [packages/ai/src/types.ts:438](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L438)
