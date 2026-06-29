---
id: SummarizationOptions
title: SummarizationOptions
---

# Interface: SummarizationOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1498](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1498)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### focus?

```ts
optional focus: string[];
```

Defined in: [packages/ai/src/types.ts:1505](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1505)

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1512](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1512)

Internal logger threaded from the summarize() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### maxLength?

```ts
optional maxLength: number;
```

Defined in: [packages/ai/src/types.ts:1503](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1503)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1501](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1501)

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1507](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1507)

Provider-specific options forwarded by the summarize() activity.

***

### style?

```ts
optional style: "bullet-points" | "paragraph" | "concise";
```

Defined in: [packages/ai/src/types.ts:1504](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1504)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1502](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1502)
