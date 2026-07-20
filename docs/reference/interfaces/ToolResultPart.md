---
id: ToolResultPart
title: ToolResultPart
---

# Interface: ToolResultPart

Defined in: [packages/ai/src/types.ts:400](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L400)

## Properties

### content

```ts
content: 
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[];
```

Defined in: [packages/ai/src/types.ts:403](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L403)

***

### error?

```ts
optional error: string;
```

Defined in: [packages/ai/src/types.ts:405](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L405)

***

### state

```ts
state: ToolResultState;
```

Defined in: [packages/ai/src/types.ts:404](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L404)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/types.ts:402](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L402)

***

### type

```ts
type: "tool-result";
```

Defined in: [packages/ai/src/types.ts:401](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L401)
