---
id: SummarizationOptions
title: SummarizationOptions
---

# Interface: SummarizationOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1648](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1648)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### focus?

```ts
optional focus: string[];
```

Defined in: [packages/ai/src/types.ts:1655](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1655)

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1662](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1662)

Internal logger threaded from the summarize() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### maxLength?

```ts
optional maxLength: number;
```

Defined in: [packages/ai/src/types.ts:1653](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1653)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1651](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1651)

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1657](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1657)

Provider-specific options forwarded by the summarize() activity.

***

### style?

```ts
optional style: "bullet-points" | "paragraph" | "concise";
```

Defined in: [packages/ai/src/types.ts:1654](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1654)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1652](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1652)
