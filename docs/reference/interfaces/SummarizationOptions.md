---
id: SummarizationOptions
title: SummarizationOptions
---

# Interface: SummarizationOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1711](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1711)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:1741](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1741)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### focus?

```ts
optional focus?: string[];
```

Defined in: [packages/ai/src/types.ts:1718](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1718)

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1735](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1735)

Internal logger threaded from the summarize() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### maxLength?

```ts
optional maxLength?: number;
```

Defined in: [packages/ai/src/types.ts:1716](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1716)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1714](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1714)

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1720](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1720)

Provider-specific options forwarded by the summarize() activity.

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:1729](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1729)

Run identity forwarded from the summarize() activity. When set, the
streaming adapter stamps it onto the emitted `RUN_STARTED` (via the wrapped
chat), so a delivery-durable route keys the run's log by the same id the
client rejoins with — making a mid-run reload resumable, like the media
activities. Optional and non-breaking: adapters that ignore it just mint
their own.

***

### style?

```ts
optional style?: "bullet-points" | "paragraph" | "concise";
```

Defined in: [packages/ai/src/types.ts:1717](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1717)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1715](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1715)

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: [packages/ai/src/types.ts:1730](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1730)
