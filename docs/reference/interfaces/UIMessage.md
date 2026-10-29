---
id: UIMessage
title: UIMessage
---

Defined in: [packages/ai/src/types.ts:805](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L805)

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

Defined in: [packages/ai/src/types.ts:809](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L809)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:806](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L806)

***

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:816](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L816)

Optional AG-UI metadata bag. TanStack writes the `tanstack` key.
User keys stay at the top.

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/types.ts:811](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L811)

Optional AG-UI sender name. Converters preserve it across wire and persist.

***

### parts

```ts
parts: MessagePart<TData>[];
```

Defined in: [packages/ai/src/types.ts:808](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L808)

***

### role

```ts
role: "assistant" | "user" | "activity" | "system";
```

Defined in: [packages/ai/src/types.ts:807](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L807)
