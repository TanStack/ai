---
id: TanStackRunMetadata
title: TanStackRunMetadata
---

Defined in: packages/ai/src/types.ts:757

Shape of `metadata.tanstack` on run events.

## Properties

### args?

```ts
optional args?: string;
```

Defined in: packages/ai/src/types.ts:777

The raw tool argument string on `TOOL_CALL_END`, as the provider sent it.

***

### finishReason?

```ts
optional finishReason?: "length" | "stop" | "content_filter" | "tool_calls" | null;
```

Defined in: packages/ai/src/types.ts:763

***

### index?

```ts
optional index?: number;
```

Defined in: packages/ai/src/types.ts:770

***

### input?

```ts
optional input?: unknown;
```

Defined in: packages/ai/src/types.ts:775

Parsed `TOOL_CALL_END` input. Spec `TOOL_CALL_END` has no top-level `input`.

***

### interruptErrors?

```ts
optional interruptErrors?: readonly InterruptSubmissionError[];
```

Defined in: packages/ai/src/types.ts:766

***

### model?

```ts
optional model?: string;
```

Defined in: packages/ai/src/types.ts:759

***

### responseId?

```ts
optional responseId?: string;
```

Defined in: packages/ai/src/types.ts:760

***

### responseItems?

```ts
optional responseItems?: object[];
```

Defined in: packages/ai/src/types.ts:762

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

Defined in: packages/ai/src/types.ts:772

On a `RUN_ERROR`. See `RunErrorEvent.retryAfterMs`.

***

### runId?

```ts
optional runId?: string;
```

Defined in: packages/ai/src/types.ts:768

***

### sessionId?

```ts
optional sessionId?: string;
```

Defined in: packages/ai/src/types.ts:769

***

### source?

```ts
optional source?: MessageSource;
```

Defined in: packages/ai/src/types.ts:758

***

### state?

```ts
optional state?: ToolOutputState;
```

Defined in: packages/ai/src/types.ts:773

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: packages/ai/src/types.ts:767

***

### usage?

```ts
optional usage?: TokenUsageLeftover;
```

Defined in: packages/ai/src/types.ts:765

TokenUsage fields that have no AG-UI `usage[]` equivalent.
