---
id: SummarizationOptions
title: SummarizationOptions
---

# Interface: SummarizationOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1639](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1639)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### focus?

```ts
optional focus: string[];
```

Defined in: [packages/ai/src/types.ts:1646](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1646)

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1653](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1653)

Internal logger threaded from the summarize() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### maxLength?

```ts
optional maxLength: number;
```

Defined in: [packages/ai/src/types.ts:1644](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1644)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1642](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1642)

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1648](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1648)

Provider-specific options forwarded by the summarize() activity.

***

### style?

```ts
optional style: "bullet-points" | "paragraph" | "concise";
```

Defined in: [packages/ai/src/types.ts:1645](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1645)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1643](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1643)
