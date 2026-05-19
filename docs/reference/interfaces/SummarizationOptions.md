---
id: SummarizationOptions
title: SummarizationOptions
---

# Interface: SummarizationOptions\<TProviderOptions\>

Defined in: [packages/typescript/ai/src/types.ts:1361](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1361)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### focus?

```ts
optional focus: string[];
```

Defined in: [packages/typescript/ai/src/types.ts:1368](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1368)

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:1375](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1375)

Internal logger threaded from the summarize() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### maxLength?

```ts
optional maxLength: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1366](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1366)

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1364](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1364)

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1370](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1370)

Provider-specific options forwarded by the summarize() activity.

***

### style?

```ts
optional style: "bullet-points" | "paragraph" | "concise";
```

Defined in: [packages/typescript/ai/src/types.ts:1367](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1367)

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1365](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1365)
