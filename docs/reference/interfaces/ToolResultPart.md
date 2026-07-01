---
id: ToolResultPart
title: ToolResultPart
---

# Interface: ToolResultPart

Defined in: [packages/ai/src/types.ts:369](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L369)

## Properties

### content

```ts
content: 
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[];
```

Defined in: [packages/ai/src/types.ts:372](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L372)

***

### error?

```ts
optional error: string;
```

Defined in: [packages/ai/src/types.ts:374](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L374)

***

### state

```ts
state: ToolResultState;
```

Defined in: [packages/ai/src/types.ts:373](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L373)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/types.ts:371](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L371)

***

### type

```ts
type: "tool-result";
```

Defined in: [packages/ai/src/types.ts:370](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L370)
