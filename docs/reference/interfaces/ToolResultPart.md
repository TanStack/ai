---
id: ToolResultPart
title: ToolResultPart
---

# Interface: ToolResultPart

Defined in: [packages/ai/src/types.ts:394](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L394)

## Properties

### content

```ts
content: 
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[];
```

Defined in: [packages/ai/src/types.ts:397](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L397)

***

### error?

```ts
optional error: string;
```

Defined in: [packages/ai/src/types.ts:399](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L399)

***

### state

```ts
state: ToolResultState;
```

Defined in: [packages/ai/src/types.ts:398](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L398)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/types.ts:396](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L396)

***

### type

```ts
type: "tool-result";
```

Defined in: [packages/ai/src/types.ts:395](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L395)
