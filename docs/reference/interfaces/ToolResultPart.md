---
id: ToolResultPart
title: ToolResultPart
---

# Interface: ToolResultPart

Defined in: [packages/ai/src/types.ts:357](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L357)

## Properties

### content

```ts
content: 
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[];
```

Defined in: [packages/ai/src/types.ts:360](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L360)

***

### error?

```ts
optional error: string;
```

Defined in: [packages/ai/src/types.ts:362](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L362)

***

### state

```ts
state: ToolResultState;
```

Defined in: [packages/ai/src/types.ts:361](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L361)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/types.ts:359](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L359)

***

### type

```ts
type: "tool-result";
```

Defined in: [packages/ai/src/types.ts:358](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L358)
