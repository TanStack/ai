---
id: ToolResultPart
title: ToolResultPart
---

# Interface: ToolResultPart

Defined in: [packages/ai/src/types.ts:440](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L440)

## Properties

### content

```ts
content: 
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[];
```

Defined in: [packages/ai/src/types.ts:445](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L445)

***

### createdAt?

```ts
optional createdAt?: Date;
```

Defined in: [packages/ai/src/types.ts:449](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L449)

***

### error?

```ts
optional error?: string;
```

Defined in: [packages/ai/src/types.ts:447](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L447)

***

### id?

```ts
optional id?: string;
```

Defined in: [packages/ai/src/types.ts:442](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L442)

***

### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

Defined in: [packages/ai/src/types.ts:448](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L448)

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/types.ts:443](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L443)

***

### state

```ts
state: ToolResultState;
```

Defined in: [packages/ai/src/types.ts:446](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L446)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/types.ts:444](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L444)

***

### type

```ts
type: "tool-result";
```

Defined in: [packages/ai/src/types.ts:441](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L441)
