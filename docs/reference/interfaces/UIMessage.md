---
id: UIMessage
title: UIMessage
---

# Interface: UIMessage

Defined in: [types.ts:219](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L219)

UIMessage - Domain-specific message format optimized for building chat UIs
Contains parts that can be text, tool calls, or tool results

## Properties

### createdAt?

```ts
optional createdAt: Date;
```

Defined in: [types.ts:223](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L223)

***

### id

```ts
id: string;
```

Defined in: [types.ts:220](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L220)

***

### parts

```ts
parts: MessagePart[];
```

Defined in: [types.ts:222](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L222)

***

### role

```ts
role: "user" | "assistant" | "system";
```

Defined in: [types.ts:221](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L221)
