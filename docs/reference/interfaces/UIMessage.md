---
id: UIMessage
title: UIMessage
---

# Interface: UIMessage

Defined in: [types.ts:227](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L227)

UIMessage - Domain-specific message format optimized for building chat UIs
Contains parts that can be text, tool calls, or tool results

## Properties

### createdAt?

```ts
optional createdAt: Date;
```

Defined in: [types.ts:231](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L231)

***

### id

```ts
id: string;
```

Defined in: [types.ts:228](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L228)

***

### parts

```ts
parts: MessagePart[];
```

Defined in: [types.ts:230](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L230)

***

### role

```ts
role: "user" | "assistant" | "system";
```

Defined in: [types.ts:229](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L229)
