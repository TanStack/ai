---
id: UIMessage
title: UIMessage
---

# Interface: UIMessage

Defined in: [types.ts:325](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L325)

UIMessage - Domain-specific message format optimized for building chat UIs
Contains parts that can be text, tool calls, or tool results

## Properties

### createdAt?

```ts
optional createdAt: Date;
```

Defined in: [types.ts:329](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L329)

***

### id

```ts
id: string;
```

Defined in: [types.ts:326](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L326)

***

### parts

```ts
parts: MessagePart[];
```

Defined in: [types.ts:328](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L328)

***

### role

```ts
role: "user" | "assistant" | "system";
```

Defined in: [types.ts:327](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L327)
