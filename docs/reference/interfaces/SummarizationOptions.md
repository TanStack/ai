---
id: SummarizationOptions
title: SummarizationOptions
---

# Interface: SummarizationOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1473](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1473)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### focus?

```ts
optional focus: string[];
```

Defined in: [packages/ai/src/types.ts:1480](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1480)

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1487](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1487)

Internal logger threaded from the summarize() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### maxLength?

```ts
optional maxLength: number;
```

Defined in: [packages/ai/src/types.ts:1478](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1478)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1476](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1476)

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1482](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1482)

Provider-specific options forwarded by the summarize() activity.

***

### style?

```ts
optional style: "bullet-points" | "paragraph" | "concise";
```

Defined in: [packages/ai/src/types.ts:1479](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1479)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1477](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1477)
