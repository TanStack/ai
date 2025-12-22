---
id: UIMessage
title: UIMessage
---

# Interface: UIMessage

Defined in: [types.ts:293](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L293)

UIMessage - Domain-specific message format optimized for building chat UIs
Contains parts that can be text, tool calls, or tool results

## Properties

### createdAt?

```ts
optional createdAt: Date;
```

Defined in: [types.ts:297](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L297)

***

### id

```ts
id: string;
```

Defined in: [types.ts:294](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L294)

***

### parts

```ts
parts: MessagePart[];
```

Defined in: [types.ts:296](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L296)

***

### role

```ts
role: "user" | "assistant" | "system";
```

Defined in: [types.ts:295](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L295)
