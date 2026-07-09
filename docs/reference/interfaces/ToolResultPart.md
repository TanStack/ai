---
id: ToolResultPart
title: ToolResultPart
---

# Interface: ToolResultPart

Defined in: [packages/ai/src/types.ts:391](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L391)

## Properties

### content

```ts
content: 
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[];
```

Defined in: [packages/ai/src/types.ts:394](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L394)

***

### error?

```ts
optional error: string;
```

Defined in: [packages/ai/src/types.ts:396](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L396)

***

### state

```ts
state: ToolResultState;
```

Defined in: [packages/ai/src/types.ts:395](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L395)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/types.ts:393](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L393)

***

### type

```ts
type: "tool-result";
```

Defined in: [packages/ai/src/types.ts:392](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L392)
