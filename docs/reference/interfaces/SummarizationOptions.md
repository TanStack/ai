---
id: SummarizationOptions
title: SummarizationOptions
---

# Interface: SummarizationOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1657](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1657)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### focus?

```ts
optional focus: string[];
```

Defined in: [packages/ai/src/types.ts:1664](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1664)

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1671](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1671)

Internal logger threaded from the summarize() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### maxLength?

```ts
optional maxLength: number;
```

Defined in: [packages/ai/src/types.ts:1662](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1662)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1660](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1660)

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1666](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1666)

Provider-specific options forwarded by the summarize() activity.

***

### style?

```ts
optional style: "bullet-points" | "paragraph" | "concise";
```

Defined in: [packages/ai/src/types.ts:1663](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1663)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1661](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1661)
