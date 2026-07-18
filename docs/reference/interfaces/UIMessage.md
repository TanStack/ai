---
id: UIMessage
title: UIMessage
---

# Interface: UIMessage\<TData\>

Defined in: [packages/ai/src/types.ts:487](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L487)

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

Defined in: [packages/ai/src/types.ts:491](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L491)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:488](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L488)

***

### parts

```ts
parts: MessagePart<TData>[];
```

Defined in: [packages/ai/src/types.ts:490](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L490)

***

### role

```ts
role: "user" | "assistant" | "system";
```

Defined in: [packages/ai/src/types.ts:489](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L489)
