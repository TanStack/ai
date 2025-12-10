---
id: UIMessage
title: UIMessage
---

# Interface: UIMessage

Defined in: [types.ts:281](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L281)

UIMessage - Domain-specific message format optimized for building chat UIs
Contains parts that can be text, tool calls, or tool results

## Properties

### createdAt?

```ts
optional createdAt: Date;
```

Defined in: [types.ts:285](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L285)

***

### id

```ts
id: string;
```

Defined in: [types.ts:282](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L282)

***

### parts

```ts
parts: MessagePart[];
```

Defined in: [types.ts:284](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L284)

***

### role

```ts
role: "user" | "assistant" | "system";
```

Defined in: [types.ts:283](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L283)
