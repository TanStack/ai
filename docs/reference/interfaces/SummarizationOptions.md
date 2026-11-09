---
id: SummarizationOptions
title: SummarizationOptions
---

Defined in: [packages/ai/src/types.ts:2229](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2229)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:2259](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2259)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### focus?

```ts
optional focus?: string[];
```

Defined in: [packages/ai/src/types.ts:2236](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2236)

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2253](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2253)

Internal logger threaded from the summarize() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### maxLength?

```ts
optional maxLength?: number;
```

Defined in: [packages/ai/src/types.ts:2234](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2234)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2232](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2232)

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2238](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2238)

Provider-specific options forwarded by the summarize() activity.

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:2247](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2247)

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

Defined in: [packages/ai/src/types.ts:2235](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2235)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2233](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2233)

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/types.ts:2248](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2248)
