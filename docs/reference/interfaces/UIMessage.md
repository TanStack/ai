---
id: UIMessage
title: UIMessage
---

Defined in: [packages/ai/src/types.ts:820](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L820)

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

Defined in: [packages/ai/src/types.ts:824](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L824)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:821](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L821)

***

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:831](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L831)

Optional AG-UI metadata bag. TanStack writes the `tanstack` key.
User keys stay at the top.

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/types.ts:826](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L826)

Optional AG-UI sender name. Converters preserve it across wire and persist.

***

### parts

```ts
parts: MessagePart<TData>[];
```

Defined in: [packages/ai/src/types.ts:823](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L823)

***

### role

```ts
role: "assistant" | "user" | "activity" | "system";
```

Defined in: [packages/ai/src/types.ts:822](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L822)
