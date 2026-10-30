---
id: TanStackRunMetadata
title: TanStackRunMetadata
---

Defined in: [packages/ai/src/types.ts:767](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L767)

Shape of `metadata.tanstack` on run events.

## Properties

### args?

```ts
optional args?: string;
```

Defined in: [packages/ai/src/types.ts:795](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L795)

The raw tool argument string on `TOOL_CALL_END`, as the provider sent it.

***

### errorType?

```ts
optional errorType?: string;
```

Defined in: [packages/ai/src/types.ts:788](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L788)

On a `RUN_ERROR`. See `RunErrorEvent.errorType`.

***

### finishReason?

```ts
optional finishReason?: "length" | "stop" | "content_filter" | "tool_calls" | null;
```

Defined in: [packages/ai/src/types.ts:775](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L775)

***

### index?

```ts
optional index?: number;
```

Defined in: [packages/ai/src/types.ts:782](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L782)

***

### input?

```ts
optional input?: unknown;
```

Defined in: [packages/ai/src/types.ts:793](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L793)

Parsed `TOOL_CALL_END` input. Spec `TOOL_CALL_END` has no top-level `input`.

***

### interruptErrors?

```ts
optional interruptErrors?: readonly InterruptSubmissionError[];
```

Defined in: [packages/ai/src/types.ts:778](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L778)

***

### model?

```ts
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:769](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L769)

***

### rawText?

```ts
optional rawText?: string;
```

Defined in: [packages/ai/src/types.ts:786](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L786)

On a `RUN_ERROR`. See `RunErrorEvent.rawText`.

***

### reasoningItem?

```ts
optional reasoningItem?: boolean;
```

Defined in: [packages/ai/src/types.ts:774](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L774)

See `TanStackMessageMetadata.reasoningItem`.

***

### requestId?

```ts
optional requestId?: string;
```

Defined in: [packages/ai/src/types.ts:790](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L790)

On a `RUN_ERROR`. See `RunErrorEvent.requestId`.

***

### responseId?

```ts
optional responseId?: string;
```

Defined in: [packages/ai/src/types.ts:770](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L770)

***

### responseItems?

```ts
optional responseItems?: object[];
```

Defined in: [packages/ai/src/types.ts:772](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L772)

The answer items of this model call. See `TanStackMessageMetadata.responseItems`.

#### id

```ts
id: string;
```

#### phase?

```ts
optional phase?: string;
```

***

### retryAfterMs?

```ts
optional retryAfterMs?: number;
```

Defined in: [packages/ai/src/types.ts:784](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L784)

On a `RUN_ERROR`. See `RunErrorEvent.retryAfterMs`.

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:780](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L780)

***

### sessionId?

```ts
optional sessionId?: string;
```

Defined in: [packages/ai/src/types.ts:781](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L781)

***

### source?

```ts
optional source?: MessageSource;
```

Defined in: [packages/ai/src/types.ts:768](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L768)

***

### state?

```ts
optional state?: ToolOutputState;
```

Defined in: [packages/ai/src/types.ts:791](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L791)

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: [packages/ai/src/types.ts:779](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L779)

***

### usage?

```ts
optional usage?: TokenUsageLeftover;
```

Defined in: [packages/ai/src/types.ts:777](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L777)

TokenUsage fields that have no AG-UI `usage[]` equivalent.
