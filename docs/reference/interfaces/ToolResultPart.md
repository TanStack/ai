---
id: ToolResultPart
title: ToolResultPart
---

# Interface: ToolResultPart

Defined in: [packages/ai/src/types.ts:368](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L368)

## Properties

### content

```ts
content: 
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[];
```

Defined in: [packages/ai/src/types.ts:371](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L371)

***

### error?

```ts
optional error: string;
```

Defined in: [packages/ai/src/types.ts:373](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L373)

***

### state

```ts
state: ToolResultState;
```

Defined in: [packages/ai/src/types.ts:372](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L372)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/types.ts:370](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L370)

***

### type

```ts
type: "tool-result";
```

Defined in: [packages/ai/src/types.ts:369](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L369)
