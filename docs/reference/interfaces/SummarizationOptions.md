---
id: SummarizationOptions
title: SummarizationOptions
---

# Interface: SummarizationOptions\<TProviderOptions\>

Defined in: [packages/typescript/ai/src/types.ts:1381](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1381)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### focus?

```ts
optional focus: string[];
```

Defined in: [packages/typescript/ai/src/types.ts:1388](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1388)

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:1395](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1395)

Internal logger threaded from the summarize() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### maxLength?

```ts
optional maxLength: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1386](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1386)

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1384](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1384)

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1390](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1390)

Provider-specific options forwarded by the summarize() activity.

***

### style?

```ts
optional style: "bullet-points" | "paragraph" | "concise";
```

Defined in: [packages/typescript/ai/src/types.ts:1387](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1387)

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1385](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1385)
