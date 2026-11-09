---
id: TanStackRunMetadata
title: TanStackRunMetadata
---

Defined in: [packages/ai/src/types.ts:774](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L774)

Shape of `metadata.tanstack` on run events.

## Properties

### args?

```ts
optional args?: string;
```

Defined in: [packages/ai/src/types.ts:810](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L810)

The raw tool argument string on `TOOL_CALL_END`, as the provider sent it.

***

### errorType?

```ts
optional errorType?: string;
```

Defined in: [packages/ai/src/types.ts:803](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L803)

On a `RUN_ERROR`. See `RunErrorEvent.errorType`.

***

### finishReason?

```ts
optional finishReason?: "length" | "stop" | "content_filter" | "tool_calls" | null;
```

Defined in: [packages/ai/src/types.ts:782](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L782)

***

### index?

```ts
optional index?: number;
```

Defined in: [packages/ai/src/types.ts:797](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L797)

***

### input?

```ts
optional input?: unknown;
```

Defined in: [packages/ai/src/types.ts:808](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L808)

Parsed `TOOL_CALL_END` input. Spec `TOOL_CALL_END` has no top-level `input`.

***

### interruptErrors?

```ts
optional interruptErrors?: readonly InterruptSubmissionError[];
```

Defined in: [packages/ai/src/types.ts:793](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L793)

***

### loopStopped?

```ts
optional loopStopped?: boolean;
```

Defined in: [packages/ai/src/types.ts:790](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L790)

`true` on the last `RUN_FINISHED` of a run that the agent loop stopped
before the model was done: `agentLoopStrategy` (for example
`maxIterations`) or a middleware `onShouldContinue` returned `false`
while tool results waited for the next model call. `finishReason` stays
the reason of the last model call.

***

### model?

```ts
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:776](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L776)

***

### rawText?

```ts
optional rawText?: string;
```

Defined in: [packages/ai/src/types.ts:801](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L801)

On a `RUN_ERROR`. See `RunErrorEvent.rawText`.

***

### reasoningItem?

```ts
optional reasoningItem?: boolean;
```

Defined in: [packages/ai/src/types.ts:781](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L781)

See `TanStackMessageMetadata.reasoningItem`.

***

### requestId?

```ts
optional requestId?: string;
```

Defined in: [packages/ai/src/types.ts:805](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L805)

On a `RUN_ERROR`. See `RunErrorEvent.requestId`.

***

### responseId?

```ts
optional responseId?: string;
```

Defined in: [packages/ai/src/types.ts:777](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L777)

***

### responseItems?

```ts
optional responseItems?: object[];
```

Defined in: [packages/ai/src/types.ts:779](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L779)

The answer items of this model call. See `TanStackMessageMetadata.responseItems`.

#### id

```ts
id: string;
```

#### phase?

```ts
optional phase?: string;
```

#### textLength?

```ts
optional textLength?: number;
```

UTF-16 text length, retaining item boundaries when adjacent text is merged.

***

### retryAfterMs?

```ts
optional retryAfterMs?: number;
```

Defined in: [packages/ai/src/types.ts:799](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L799)

On a `RUN_ERROR`. See `RunErrorEvent.retryAfterMs`.

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:795](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L795)

***

### sessionId?

```ts
optional sessionId?: string;
```

Defined in: [packages/ai/src/types.ts:796](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L796)

***

### source?

```ts
optional source?: MessageSource;
```

Defined in: [packages/ai/src/types.ts:775](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L775)

***

### state?

```ts
optional state?: ToolOutputState;
```

Defined in: [packages/ai/src/types.ts:806](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L806)

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: [packages/ai/src/types.ts:794](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L794)

***

### usage?

```ts
optional usage?: TokenUsageLeftover;
```

Defined in: [packages/ai/src/types.ts:792](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L792)

TokenUsage fields that have no AG-UI `usage[]` equivalent.
