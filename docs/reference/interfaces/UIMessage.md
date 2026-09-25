---
id: UIMessage
title: UIMessage
---

Defined in: [packages/ai/src/types.ts:610](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L610)

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

Defined in: [packages/ai/src/types.ts:614](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L614)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:611](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L611)

***

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:621](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L621)

Optional AG-UI metadata bag. TanStack writes the `tanstack` key.
User keys stay at the top.

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/types.ts:616](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L616)

Optional AG-UI sender name. Converters preserve it across wire and persist.

***

### parts

```ts
parts: MessagePart<TData>[];
```

Defined in: [packages/ai/src/types.ts:613](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L613)

***

### role

```ts
role: "assistant" | "user" | "system";
```

Defined in: [packages/ai/src/types.ts:612](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L612)
