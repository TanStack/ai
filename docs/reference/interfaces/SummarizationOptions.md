---
id: SummarizationOptions
title: SummarizationOptions
---

Defined in: [packages/ai/src/types.ts:1751](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1751)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:1781](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1781)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### focus?

```ts
optional focus?: string[];
```

Defined in: [packages/ai/src/types.ts:1758](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1758)

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1775](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1775)

Internal logger threaded from the summarize() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### maxLength?

```ts
optional maxLength?: number;
```

Defined in: [packages/ai/src/types.ts:1756](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1756)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1754](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1754)

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1760](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1760)

Provider-specific options forwarded by the summarize() activity.

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:1769](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1769)

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

Defined in: [packages/ai/src/types.ts:1757](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1757)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1755](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1755)

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: [packages/ai/src/types.ts:1770](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1770)
