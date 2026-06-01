---
id: SummarizationOptions
title: SummarizationOptions
---

# Interface: SummarizationOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1483](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1483)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### focus?

```ts
optional focus: string[];
```

Defined in: [packages/ai/src/types.ts:1490](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1490)

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1497](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1497)

Internal logger threaded from the summarize() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### maxLength?

```ts
optional maxLength: number;
```

Defined in: [packages/ai/src/types.ts:1488](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1488)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1486](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1486)

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1492](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1492)

Provider-specific options forwarded by the summarize() activity.

***

### style?

```ts
optional style: "bullet-points" | "paragraph" | "concise";
```

Defined in: [packages/ai/src/types.ts:1489](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1489)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1487](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1487)
