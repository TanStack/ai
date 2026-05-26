---
id: SummarizationOptions
title: SummarizationOptions
---

# Interface: SummarizationOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1397](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1397)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### focus?

```ts
optional focus: string[];
```

Defined in: [packages/ai/src/types.ts:1404](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1404)

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1411](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1411)

Internal logger threaded from the summarize() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### maxLength?

```ts
optional maxLength: number;
```

Defined in: [packages/ai/src/types.ts:1402](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1402)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1400](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1400)

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1406](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1406)

Provider-specific options forwarded by the summarize() activity.

***

### style?

```ts
optional style: "bullet-points" | "paragraph" | "concise";
```

Defined in: [packages/ai/src/types.ts:1403](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1403)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1401](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1401)
