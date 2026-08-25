---
id: UIMessage
title: UIMessage
---

# Interface: UIMessage\<TData\>

Defined in: [packages/ai/src/types.ts:576](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L576)

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

Defined in: [packages/ai/src/types.ts:580](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L580)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:577](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L577)

***

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:587](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L587)

Optional AG-UI metadata bag. TanStack writes the `tanstack` key.
User keys stay at the top.

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/types.ts:582](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L582)

Optional AG-UI sender name. Converters preserve it across wire and persist.

***

### parts

```ts
parts: MessagePart<TData>[];
```

Defined in: [packages/ai/src/types.ts:579](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L579)

***

### role

```ts
role: "user" | "assistant" | "system";
```

Defined in: [packages/ai/src/types.ts:578](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L578)
