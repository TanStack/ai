---
id: SummarizationOptions
title: SummarizationOptions
---

# Interface: SummarizationOptions\<TProviderOptions\>

Defined in: [packages/typescript/ai/src/types.ts:1313](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1313)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### focus?

```ts
optional focus: string[];
```

Defined in: [packages/typescript/ai/src/types.ts:1320](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1320)

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:1327](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1327)

Internal logger threaded from the summarize() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### maxLength?

```ts
optional maxLength: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1318](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1318)

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1316](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1316)

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1322](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1322)

Provider-specific options forwarded by the summarize() activity.

***

### style?

```ts
optional style: "bullet-points" | "paragraph" | "concise";
```

Defined in: [packages/typescript/ai/src/types.ts:1319](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1319)

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1317](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1317)
