---
id: SummarizationOptions
title: SummarizationOptions
---

# Interface: SummarizationOptions\<TProviderOptions\>

Defined in: [packages/typescript/ai/src/types.ts:1376](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1376)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### focus?

```ts
optional focus: string[];
```

Defined in: [packages/typescript/ai/src/types.ts:1383](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1383)

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:1390](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1390)

Internal logger threaded from the summarize() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### maxLength?

```ts
optional maxLength: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1381](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1381)

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1379](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1379)

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1385](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1385)

Provider-specific options forwarded by the summarize() activity.

***

### style?

```ts
optional style: "bullet-points" | "paragraph" | "concise";
```

Defined in: [packages/typescript/ai/src/types.ts:1382](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1382)

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1380](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1380)
