---
id: SummarizationOptions
title: SummarizationOptions
---

# Interface: SummarizationOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1983](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1983)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:2013](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2013)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### focus?

```ts
optional focus?: string[];
```

Defined in: [packages/ai/src/types.ts:1990](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1990)

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2007](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2007)

Internal logger threaded from the summarize() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### maxLength?

```ts
optional maxLength?: number;
```

Defined in: [packages/ai/src/types.ts:1988](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1988)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1986](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1986)

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1992](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1992)

Provider-specific options forwarded by the summarize() activity.

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:2001](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2001)

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

Defined in: [packages/ai/src/types.ts:1989](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1989)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1987](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1987)

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: [packages/ai/src/types.ts:2002](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2002)
