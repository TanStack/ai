---
id: UIMessage
title: UIMessage
---

# Interface: UIMessage\<TData\>

Defined in: [packages/ai/src/types.ts:514](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L514)

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

Defined in: [packages/ai/src/types.ts:518](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L518)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:515](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L515)

***

### parts

```ts
parts: MessagePart<TData>[];
```

Defined in: [packages/ai/src/types.ts:517](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L517)

***

### role

```ts
role: "user" | "assistant" | "system";
```

Defined in: [packages/ai/src/types.ts:516](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L516)
