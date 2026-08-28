---
id: TanStackRunMetadata
title: TanStackRunMetadata
---

# Interface: TanStackRunMetadata

Defined in: [packages/ai/src/types.ts:554](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L554)

Shape of `metadata.tanstack` on run events.

## Properties

### finishReason?

```ts
optional finishReason?: "length" | "stop" | "content_filter" | "tool_calls" | null;
```

Defined in: [packages/ai/src/types.ts:556](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L556)

***

### index?

```ts
optional index?: number;
```

Defined in: [packages/ai/src/types.ts:563](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L563)

***

### input?

```ts
optional input?: unknown;
```

Defined in: [packages/ai/src/types.ts:566](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L566)

Parsed `TOOL_CALL_END` input. Spec `TOOL_CALL_END` has no top-level `input`.

***

### interruptErrors?

```ts
optional interruptErrors?: readonly InterruptSubmissionError[];
```

Defined in: [packages/ai/src/types.ts:559](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L559)

***

### model?

```ts
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:555](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L555)

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:561](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L561)

***

### sessionId?

```ts
optional sessionId?: string;
```

Defined in: [packages/ai/src/types.ts:562](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L562)

***

### state?

```ts
optional state?: ToolOutputState;
```

Defined in: [packages/ai/src/types.ts:564](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L564)

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: [packages/ai/src/types.ts:560](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L560)

***

### usage?

```ts
optional usage?: TokenUsageLeftover;
```

Defined in: [packages/ai/src/types.ts:558](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L558)

TokenUsage fields that have no AG-UI `usage[]` equivalent.
