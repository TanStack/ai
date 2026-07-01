---
id: UIMessage
title: UIMessage
---

# Interface: UIMessage\<TData\>

Defined in: [packages/ai/src/types.ts:456](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L456)

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

Defined in: [packages/ai/src/types.ts:460](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L460)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:457](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L457)

***

### parts

```ts
parts: MessagePart<TData>[];
```

Defined in: [packages/ai/src/types.ts:459](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L459)

***

### role

```ts
role: "user" | "assistant" | "system";
```

Defined in: [packages/ai/src/types.ts:458](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L458)
