---
id: UIMessage
title: UIMessage
---

# Interface: UIMessage

Defined in: [packages/typescript/ai/src/types.ts:353](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L353)

UIMessage - Domain-specific message format optimized for building chat UIs
Contains parts that can be text, tool calls, or tool results

## Properties

### createdAt?

```ts
optional createdAt: Date;
```

Defined in: [packages/typescript/ai/src/types.ts:357](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L357)

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:354](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L354)

***

### parts

```ts
parts: MessagePart[];
```

Defined in: [packages/typescript/ai/src/types.ts:356](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L356)

***

### role

```ts
role: "user" | "assistant" | "system";
```

Defined in: [packages/typescript/ai/src/types.ts:355](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L355)
