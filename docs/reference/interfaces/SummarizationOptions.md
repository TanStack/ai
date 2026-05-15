---
id: SummarizationOptions
title: SummarizationOptions
---

# Interface: SummarizationOptions\<TProviderOptions\>

Defined in: [packages/typescript/ai/src/types.ts:1282](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1282)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### focus?

```ts
optional focus: string[];
```

Defined in: [packages/typescript/ai/src/types.ts:1289](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1289)

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:1296](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1296)

Internal logger threaded from the summarize() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### maxLength?

```ts
optional maxLength: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1287](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1287)

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1285](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1285)

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1291](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1291)

Provider-specific options forwarded by the summarize() activity.

***

### style?

```ts
optional style: "bullet-points" | "paragraph" | "concise";
```

Defined in: [packages/typescript/ai/src/types.ts:1288](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1288)

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1286](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1286)
