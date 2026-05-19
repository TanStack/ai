---
id: SummarizationOptions
title: SummarizationOptions
---

# Interface: SummarizationOptions\<TProviderOptions\>

Defined in: [packages/typescript/ai/src/types.ts:1371](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1371)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### focus?

```ts
optional focus: string[];
```

Defined in: [packages/typescript/ai/src/types.ts:1378](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1378)

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:1385](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1385)

Internal logger threaded from the summarize() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### maxLength?

```ts
optional maxLength: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1376](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1376)

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1374](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1374)

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1380](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1380)

Provider-specific options forwarded by the summarize() activity.

***

### style?

```ts
optional style: "bullet-points" | "paragraph" | "concise";
```

Defined in: [packages/typescript/ai/src/types.ts:1377](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1377)

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1375](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1375)
