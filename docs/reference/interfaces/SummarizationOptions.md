---
id: SummarizationOptions
title: SummarizationOptions
---

Defined in: [packages/ai/src/types.ts:1941](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1941)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:1971](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1971)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### focus?

```ts
optional focus?: string[];
```

Defined in: [packages/ai/src/types.ts:1948](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1948)

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1965](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1965)

Internal logger threaded from the summarize() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### maxLength?

```ts
optional maxLength?: number;
```

Defined in: [packages/ai/src/types.ts:1946](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1946)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1944](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1944)

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1950](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1950)

Provider-specific options forwarded by the summarize() activity.

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:1959](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1959)

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

Defined in: [packages/ai/src/types.ts:1947](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1947)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1945](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1945)

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: [packages/ai/src/types.ts:1960](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1960)
