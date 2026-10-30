---
id: ToolResultPart
title: ToolResultPart
---

Defined in: [packages/ai/src/types.ts:527](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L527)

## Properties

### content

```ts
content: 
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[];
```

Defined in: [packages/ai/src/types.ts:532](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L532)

***

### createdAt?

```ts
optional createdAt?: Date;
```

Defined in: [packages/ai/src/types.ts:538](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L538)

***

### error?

```ts
optional error?: string;
```

Defined in: [packages/ai/src/types.ts:536](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L536)

***

### id?

```ts
optional id?: string;
```

Defined in: [packages/ai/src/types.ts:529](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L529)

***

### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

Defined in: [packages/ai/src/types.ts:537](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L537)

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/types.ts:530](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L530)

***

### outcome?

```ts
optional outcome?: ToolResultOutcome;
```

Defined in: [packages/ai/src/types.ts:535](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L535)

Set when the user or middleware cancelled or denied the tool call; state remains `error`.

***

### state

```ts
state: ToolResultState;
```

Defined in: [packages/ai/src/types.ts:533](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L533)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [packages/ai/src/types.ts:531](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L531)

***

### type

```ts
type: "tool-result";
```

Defined in: [packages/ai/src/types.ts:528](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L528)
