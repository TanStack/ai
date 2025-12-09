---
id: UIMessage
title: UIMessage
---

# Interface: UIMessage

Defined in: [types.ts:224](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L224)

UIMessage - Domain-specific message format optimized for building chat UIs
Contains parts that can be text, tool calls, or tool results

## Properties

### createdAt?

```ts
optional createdAt: Date;
```

Defined in: [types.ts:228](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L228)

***

### id

```ts
id: string;
```

Defined in: [types.ts:225](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L225)

***

### parts

```ts
parts: MessagePart[];
```

Defined in: [types.ts:227](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L227)

***

### role

```ts
role: "user" | "assistant" | "system";
```

Defined in: [types.ts:226](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L226)
