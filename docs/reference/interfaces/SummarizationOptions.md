---
id: SummarizationOptions
title: SummarizationOptions
---

# Interface: SummarizationOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1975](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1975)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:2005](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2005)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### focus?

```ts
optional focus?: string[];
```

Defined in: [packages/ai/src/types.ts:1982](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1982)

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1999](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1999)

Internal logger threaded from the summarize() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### maxLength?

```ts
optional maxLength?: number;
```

Defined in: [packages/ai/src/types.ts:1980](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1980)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1978](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1978)

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1984](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1984)

Provider-specific options forwarded by the summarize() activity.

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:1993](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1993)

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

Defined in: [packages/ai/src/types.ts:1981](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1981)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1979](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1979)

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: [packages/ai/src/types.ts:1994](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1994)
