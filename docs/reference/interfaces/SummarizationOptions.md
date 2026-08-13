---
id: SummarizationOptions
title: SummarizationOptions
---

# Interface: SummarizationOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1680](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1680)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### focus?

```ts
optional focus: string[];
```

Defined in: [packages/ai/src/types.ts:1687](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1687)

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1694](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1694)

Internal logger threaded from the summarize() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### maxLength?

```ts
optional maxLength: number;
```

Defined in: [packages/ai/src/types.ts:1685](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1685)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1683](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1683)

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1689](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1689)

Provider-specific options forwarded by the summarize() activity.

***

### style?

```ts
optional style: "bullet-points" | "paragraph" | "concise";
```

Defined in: [packages/ai/src/types.ts:1686](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1686)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1684](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1684)
