---
id: UIMessage
title: UIMessage
---

# Interface: UIMessage

Defined in: [types.ts:232](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L232)

UIMessage - Domain-specific message format optimized for building chat UIs
Contains parts that can be text, tool calls, or tool results

## Properties

### createdAt?

```ts
optional createdAt: Date;
```

Defined in: [types.ts:236](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L236)

***

### id

```ts
id: string;
```

Defined in: [types.ts:233](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L233)

***

### parts

```ts
parts: MessagePart[];
```

Defined in: [types.ts:235](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L235)

***

### role

```ts
role: "user" | "assistant" | "system";
```

Defined in: [types.ts:234](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L234)
