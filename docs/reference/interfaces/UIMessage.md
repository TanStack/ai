---
id: UIMessage
title: UIMessage
---

# Interface: UIMessage

Defined in: [types.ts:344](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L344)

UIMessage - Domain-specific message format optimized for building chat UIs
Contains parts that can be text, tool calls, or tool results

## Properties

### createdAt?

```ts
optional createdAt: Date;
```

Defined in: [types.ts:348](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L348)

***

### id

```ts
id: string;
```

Defined in: [types.ts:345](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L345)

***

### parts

```ts
parts: MessagePart[];
```

Defined in: [types.ts:347](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L347)

***

### role

```ts
role: "user" | "assistant" | "system";
```

Defined in: [types.ts:346](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L346)
