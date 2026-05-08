---
id: UIMessage
title: UIMessage
---

# Interface: UIMessage

Defined in: [packages/typescript/ai/src/types.ts:357](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L357)

UIMessage - Domain-specific message format optimized for building chat UIs
Contains parts that can be text, tool calls, or tool results

## Properties

### createdAt?

```ts
optional createdAt: Date;
```

Defined in: [packages/typescript/ai/src/types.ts:361](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L361)

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:358](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L358)

***

### parts

```ts
parts: MessagePart[];
```

Defined in: [packages/typescript/ai/src/types.ts:360](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L360)

***

### role

```ts
role: "user" | "assistant" | "system";
```

Defined in: [packages/typescript/ai/src/types.ts:359](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L359)
