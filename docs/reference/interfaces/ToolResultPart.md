---
id: ToolResultPart
title: ToolResultPart
---

Defined in: packages/ai/src/types.ts:524

## Properties

### content

```ts
content: 
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[];
```

Defined in: packages/ai/src/types.ts:529

***

### createdAt?

```ts
optional createdAt?: Date;
```

Defined in: packages/ai/src/types.ts:535

***

### error?

```ts
optional error?: string;
```

Defined in: packages/ai/src/types.ts:533

***

### id?

```ts
optional id?: string;
```

Defined in: packages/ai/src/types.ts:526

***

### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

Defined in: packages/ai/src/types.ts:534

***

### name?

```ts
optional name?: string;
```

Defined in: packages/ai/src/types.ts:527

***

### outcome?

```ts
optional outcome?: ToolResultOutcome;
```

Defined in: packages/ai/src/types.ts:532

Set when the user or middleware cancelled or denied the tool call; state remains `error`.

***

### state

```ts
state: ToolResultState;
```

Defined in: packages/ai/src/types.ts:530

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: packages/ai/src/types.ts:528

***

### type

```ts
type: "tool-result";
```

Defined in: packages/ai/src/types.ts:525
