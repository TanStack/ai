---
id: UIMessage
title: UIMessage
---

# Interface: UIMessage

Defined in: [packages/typescript/ai/src/types.ts:382](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L382)

UIMessage - Domain-specific message format optimized for building chat UIs
Contains parts that can be text, tool calls, or tool results

## Properties

### createdAt?

```ts
optional createdAt: Date;
```

Defined in: [packages/typescript/ai/src/types.ts:386](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L386)

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:383](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L383)

***

### parts

```ts
parts: MessagePart[];
```

Defined in: [packages/typescript/ai/src/types.ts:385](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L385)

***

### role

```ts
role: "user" | "assistant" | "system";
```

Defined in: [packages/typescript/ai/src/types.ts:384](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L384)
