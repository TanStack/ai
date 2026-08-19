---
id: UIMessage
title: UIMessage
---

# Interface: UIMessage\<TData\>

Defined in: [packages/ai/src/types.ts:512](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L512)

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

Defined in: [packages/ai/src/types.ts:516](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L516)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:513](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L513)

***

### parts

```ts
parts: MessagePart<TData>[];
```

Defined in: [packages/ai/src/types.ts:515](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L515)

***

### role

```ts
role: "user" | "assistant" | "system";
```

Defined in: [packages/ai/src/types.ts:514](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L514)
