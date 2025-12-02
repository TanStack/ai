---
id: ModelMessage
title: ModelMessage
---

# Interface: ModelMessage

Defined in: [types.ts:14](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L14)

## Properties

### content

```ts
content: string | null;
```

Defined in: [types.ts:16](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L16)

***

### name?

```ts
optional name: string;
```

Defined in: [types.ts:17](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L17)

***

### role

```ts
role: "user" | "assistant" | "tool";
```

Defined in: [types.ts:15](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L15)

***

### toolCallId?

```ts
optional toolCallId: string;
```

Defined in: [types.ts:19](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L19)

***

### toolCalls?

```ts
optional toolCalls: ToolCall[];
```

Defined in: [types.ts:18](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L18)
