---
id: SummarizationOptions
title: SummarizationOptions
---

Defined in: [packages/ai/src/types.ts:2178](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2178)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:2208](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2208)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### focus?

```ts
optional focus?: string[];
```

Defined in: [packages/ai/src/types.ts:2185](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2185)

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2202](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2202)

Internal logger threaded from the summarize() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### maxLength?

```ts
optional maxLength?: number;
```

Defined in: [packages/ai/src/types.ts:2183](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2183)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2181](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2181)

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2187](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2187)

Provider-specific options forwarded by the summarize() activity.

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:2196](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2196)

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

Defined in: [packages/ai/src/types.ts:2184](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2184)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2182](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2182)

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: [packages/ai/src/types.ts:2197](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2197)
