---
id: ToolResultPart
title: ToolResultPart
---

# Interface: ToolResultPart

Defined in: [packages/ai/src/types.ts:427](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L427)

## Properties

### content

```ts
content: 
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[];
```

Defined in: [packages/ai/src/types.ts:430](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L430)

***

### error?

```ts
optional error?: string;
```

Defined in: [packages/ai/src/types.ts:432](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L432)

***

### state

```ts
state: ToolResultState;
```

Defined in: [packages/ai/src/types.ts:431](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L431)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/types.ts:429](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L429)

***

### type

```ts
type: "tool-result";
```

Defined in: [packages/ai/src/types.ts:428](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L428)
