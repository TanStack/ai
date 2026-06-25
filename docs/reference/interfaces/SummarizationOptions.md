---
id: SummarizationOptions
title: SummarizationOptions
---

# Interface: SummarizationOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1445](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1445)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### focus?

```ts
optional focus: string[];
```

Defined in: [packages/ai/src/types.ts:1452](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1452)

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1459](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1459)

Internal logger threaded from the summarize() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### maxLength?

```ts
optional maxLength: number;
```

Defined in: [packages/ai/src/types.ts:1450](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1450)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1448](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1448)

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1454](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1454)

Provider-specific options forwarded by the summarize() activity.

***

### style?

```ts
optional style: "bullet-points" | "paragraph" | "concise";
```

Defined in: [packages/ai/src/types.ts:1451](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1451)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1449](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1449)
