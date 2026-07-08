---
id: SummarizationOptions
title: SummarizationOptions
---

# Interface: SummarizationOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1540](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1540)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### focus?

```ts
optional focus: string[];
```

Defined in: [packages/ai/src/types.ts:1547](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1547)

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1554](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1554)

Internal logger threaded from the summarize() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### maxLength?

```ts
optional maxLength: number;
```

Defined in: [packages/ai/src/types.ts:1545](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1545)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1543](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1543)

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1549](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1549)

Provider-specific options forwarded by the summarize() activity.

***

### style?

```ts
optional style: "bullet-points" | "paragraph" | "concise";
```

Defined in: [packages/ai/src/types.ts:1546](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1546)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1544](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1544)
