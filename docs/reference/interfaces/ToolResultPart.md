---
id: ToolResultPart
title: ToolResultPart
---

Defined in: [packages/ai/src/types.ts:456](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L456)

## Properties

### content

```ts
content: 
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[];
```

Defined in: [packages/ai/src/types.ts:461](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L461)

***

### createdAt?

```ts
optional createdAt?: Date;
```

Defined in: [packages/ai/src/types.ts:467](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L467)

***

### error?

```ts
optional error?: string;
```

Defined in: [packages/ai/src/types.ts:465](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L465)

***

### id?

```ts
optional id?: string;
```

Defined in: [packages/ai/src/types.ts:458](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L458)

***

### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

Defined in: [packages/ai/src/types.ts:466](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L466)

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/types.ts:459](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L459)

***

### outcome?

```ts
optional outcome?: ToolResultOutcome;
```

Defined in: [packages/ai/src/types.ts:464](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L464)

Set when the user or middleware cancelled or denied the tool call; state remains `error`.

***

### state

```ts
state: ToolResultState;
```

Defined in: [packages/ai/src/types.ts:462](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L462)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/types.ts:460](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L460)

***

### type

```ts
type: "tool-result";
```

Defined in: [packages/ai/src/types.ts:457](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L457)
