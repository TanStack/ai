---
id: UIMessage
title: UIMessage
---

# Interface: UIMessage

Defined in: [types.ts:69](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L69)

UIMessage - Domain-specific message format optimized for building chat UIs
Contains parts that can be text, tool calls, or tool results

## Properties

### createdAt?

```ts
optional createdAt: Date;
```

Defined in: [types.ts:73](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L73)

***

### id

```ts
id: string;
```

Defined in: [types.ts:70](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L70)

***

### parts

```ts
parts: MessagePart[];
```

Defined in: [types.ts:72](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L72)

***

### role

```ts
role: "user" | "assistant" | "system";
```

Defined in: [types.ts:71](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L71)
