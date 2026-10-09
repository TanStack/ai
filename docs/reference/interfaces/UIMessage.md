---
id: UIMessage
title: UIMessage
---

Defined in: [packages/ai/src/types.ts:686](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L686)

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

Defined in: [packages/ai/src/types.ts:690](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L690)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:687](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L687)

***

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:697](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L697)

Optional AG-UI metadata bag. TanStack writes the `tanstack` key.
User keys stay at the top.

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/types.ts:692](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L692)

Optional AG-UI sender name. Converters preserve it across wire and persist.

***

### parts

```ts
parts: MessagePart<TData>[];
```

Defined in: [packages/ai/src/types.ts:689](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L689)

***

### role

```ts
role: "assistant" | "user" | "activity" | "system";
```

Defined in: [packages/ai/src/types.ts:688](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L688)
