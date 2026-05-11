---
id: UIMessage
title: UIMessage
---

# Interface: UIMessage

Defined in: [packages/typescript/ai/src/types.ts:362](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L362)

UIMessage - Domain-specific message format optimized for building chat UIs
Contains parts that can be text, tool calls, or tool results

## Properties

### createdAt?

```ts
optional createdAt: Date;
```

Defined in: [packages/typescript/ai/src/types.ts:366](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L366)

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:363](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L363)

***

### parts

```ts
parts: MessagePart[];
```

Defined in: [packages/typescript/ai/src/types.ts:365](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L365)

***

### role

```ts
role: "user" | "assistant" | "system";
```

Defined in: [packages/typescript/ai/src/types.ts:364](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L364)
