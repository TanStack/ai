---
id: ToolResultPart
title: ToolResultPart
---

Defined in: [packages/ai/src/types.ts:438](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L438)

## Properties

### content

```ts
content: 
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[];
```

Defined in: [packages/ai/src/types.ts:443](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L443)

***

### createdAt?

```ts
optional createdAt?: Date;
```

Defined in: [packages/ai/src/types.ts:447](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L447)

***

### error?

```ts
optional error?: string;
```

Defined in: [packages/ai/src/types.ts:445](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L445)

***

### id?

```ts
optional id?: string;
```

Defined in: [packages/ai/src/types.ts:440](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L440)

***

### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

Defined in: [packages/ai/src/types.ts:446](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L446)

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/types.ts:441](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L441)

***

### state

```ts
state: ToolResultState;
```

Defined in: [packages/ai/src/types.ts:444](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L444)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/types.ts:442](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L442)

***

### type

```ts
type: "tool-result";
```

Defined in: [packages/ai/src/types.ts:439](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L439)
