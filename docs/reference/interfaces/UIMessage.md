---
id: UIMessage
title: UIMessage
---

Defined in: [packages/ai/src/types.ts:594](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L594)

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

Defined in: [packages/ai/src/types.ts:598](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L598)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:595](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L595)

***

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:605](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L605)

Optional AG-UI metadata bag. TanStack writes the `tanstack` key.
User keys stay at the top.

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/types.ts:600](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L600)

Optional AG-UI sender name. Converters preserve it across wire and persist.

***

### parts

```ts
parts: MessagePart<TData>[];
```

Defined in: [packages/ai/src/types.ts:597](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L597)

***

### role

```ts
role: "assistant" | "user" | "system";
```

Defined in: [packages/ai/src/types.ts:596](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L596)
