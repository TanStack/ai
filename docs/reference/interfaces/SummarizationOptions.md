---
id: SummarizationOptions
title: SummarizationOptions
---

# Interface: SummarizationOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1995](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1995)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:2025](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2025)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### focus?

```ts
optional focus?: string[];
```

Defined in: [packages/ai/src/types.ts:2002](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2002)

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2019](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2019)

Internal logger threaded from the summarize() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### maxLength?

```ts
optional maxLength?: number;
```

Defined in: [packages/ai/src/types.ts:2000](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2000)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1998](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1998)

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2004](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2004)

Provider-specific options forwarded by the summarize() activity.

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:2013](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2013)

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

Defined in: [packages/ai/src/types.ts:2001](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2001)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1999](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1999)

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: [packages/ai/src/types.ts:2014](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2014)
