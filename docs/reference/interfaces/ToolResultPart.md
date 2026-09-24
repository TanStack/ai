---
id: ToolResultPart
title: ToolResultPart
---

Defined in: [packages/ai/src/types.ts:422](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L422)

## Properties

### content

```ts
content: 
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[];
```

Defined in: [packages/ai/src/types.ts:427](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L427)

***

### createdAt?

```ts
optional createdAt?: Date;
```

Defined in: [packages/ai/src/types.ts:431](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L431)

***

### error?

```ts
optional error?: string;
```

Defined in: [packages/ai/src/types.ts:429](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L429)

***

### id?

```ts
optional id?: string;
```

Defined in: [packages/ai/src/types.ts:424](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L424)

***

### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

Defined in: [packages/ai/src/types.ts:430](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L430)

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/types.ts:425](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L425)

***

### state

```ts
state: ToolResultState;
```

Defined in: [packages/ai/src/types.ts:428](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L428)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/types.ts:426](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L426)

***

### type

```ts
type: "tool-result";
```

Defined in: [packages/ai/src/types.ts:423](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L423)
