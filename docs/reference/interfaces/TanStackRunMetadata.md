---
id: TanStackRunMetadata
title: TanStackRunMetadata
---

Defined in: [packages/ai/src/types.ts:662](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L662)

Shape of `metadata.tanstack` on run events.

## Properties

### finishReason?

```ts
optional finishReason?: "length" | "stop" | "content_filter" | "tool_calls" | null;
```

Defined in: [packages/ai/src/types.ts:664](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L664)

***

### index?

```ts
optional index?: number;
```

Defined in: [packages/ai/src/types.ts:671](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L671)

***

### input?

```ts
optional input?: unknown;
```

Defined in: [packages/ai/src/types.ts:674](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L674)

Parsed `TOOL_CALL_END` input. Spec `TOOL_CALL_END` has no top-level `input`.

***

### interruptErrors?

```ts
optional interruptErrors?: readonly InterruptSubmissionError[];
```

Defined in: [packages/ai/src/types.ts:667](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L667)

***

### model?

```ts
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:663](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L663)

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:669](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L669)

***

### sessionId?

```ts
optional sessionId?: string;
```

Defined in: [packages/ai/src/types.ts:670](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L670)

***

### state?

```ts
optional state?: ToolOutputState;
```

Defined in: [packages/ai/src/types.ts:672](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L672)

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: [packages/ai/src/types.ts:668](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L668)

***

### usage?

```ts
optional usage?: TokenUsageLeftover;
```

Defined in: [packages/ai/src/types.ts:666](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L666)

TokenUsage fields that have no AG-UI `usage[]` equivalent.
