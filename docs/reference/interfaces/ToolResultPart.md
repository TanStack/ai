---
id: ToolResultPart
title: ToolResultPart
---

# Interface: ToolResultPart

Defined in: [packages/ai/src/types.ts:436](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L436)

## Properties

### content

```ts
content: 
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[];
```

Defined in: [packages/ai/src/types.ts:439](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L439)

***

### error?

```ts
optional error?: string;
```

Defined in: [packages/ai/src/types.ts:441](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L441)

***

### state

```ts
state: ToolResultState;
```

Defined in: [packages/ai/src/types.ts:440](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L440)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/types.ts:438](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L438)

***

### type

```ts
type: "tool-result";
```

Defined in: [packages/ai/src/types.ts:437](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L437)
