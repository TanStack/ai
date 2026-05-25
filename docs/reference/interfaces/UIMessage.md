---
id: UIMessage
title: UIMessage
---

# Interface: UIMessage\<TData\>

Defined in: [packages/typescript/ai/src/types.ts:424](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L424)

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

Defined in: [packages/typescript/ai/src/types.ts:428](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L428)

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:425](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L425)

***

### parts

```ts
parts: MessagePart<TData>[];
```

Defined in: [packages/typescript/ai/src/types.ts:427](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L427)

***

### role

```ts
role: "user" | "assistant" | "system";
```

Defined in: [packages/typescript/ai/src/types.ts:426](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L426)
