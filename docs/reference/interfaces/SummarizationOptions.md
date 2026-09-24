---
id: SummarizationOptions
title: SummarizationOptions
---

Defined in: [packages/ai/src/types.ts:1811](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1811)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:1841](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1841)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### focus?

```ts
optional focus?: string[];
```

Defined in: [packages/ai/src/types.ts:1818](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1818)

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1835](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1835)

Internal logger threaded from the summarize() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### maxLength?

```ts
optional maxLength?: number;
```

Defined in: [packages/ai/src/types.ts:1816](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1816)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1814](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1814)

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1820](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1820)

Provider-specific options forwarded by the summarize() activity.

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:1829](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1829)

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

Defined in: [packages/ai/src/types.ts:1817](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1817)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1815](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1815)

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: [packages/ai/src/types.ts:1830](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1830)
