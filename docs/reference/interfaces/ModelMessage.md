---
id: ModelMessage
title: ModelMessage
---

# Interface: ModelMessage

Defined in: [types.ts:13](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L13)

## Properties

### content

```ts
content: string | null;
```

Defined in: [types.ts:15](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L15)

***

### name?

```ts
optional name: string;
```

Defined in: [types.ts:16](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L16)

***

### role

```ts
role: "user" | "assistant" | "tool";
```

Defined in: [types.ts:14](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L14)

***

### toolCallId?

```ts
optional toolCallId: string;
```

Defined in: [types.ts:18](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L18)

***

### toolCalls?

```ts
optional toolCalls: ToolCall[];
```

Defined in: [types.ts:17](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L17)
