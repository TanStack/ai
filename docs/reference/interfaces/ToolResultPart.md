---
id: ToolResultPart
title: ToolResultPart
---

# Interface: ToolResultPart

Defined in: [packages/ai/src/types.ts:433](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L433)

## Properties

### content

```ts
content: 
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[];
```

Defined in: [packages/ai/src/types.ts:436](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L436)

***

### error?

```ts
optional error?: string;
```

Defined in: [packages/ai/src/types.ts:438](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L438)

***

### state

```ts
state: ToolResultState;
```

Defined in: [packages/ai/src/types.ts:437](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L437)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/types.ts:435](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L435)

***

### type

```ts
type: "tool-result";
```

Defined in: [packages/ai/src/types.ts:434](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L434)
