---
id: TanStackRunMetadata
title: TanStackRunMetadata
---

# Interface: TanStackRunMetadata

Defined in: [packages/ai/src/types.ts:538](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L538)

Shape of `metadata.tanstack` on run events.

## Properties

### finishReason?

```ts
optional finishReason?: "length" | "stop" | "content_filter" | "tool_calls" | null;
```

Defined in: [packages/ai/src/types.ts:540](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L540)

***

### index?

```ts
optional index?: number;
```

Defined in: [packages/ai/src/types.ts:547](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L547)

***

### input?

```ts
optional input?: unknown;
```

Defined in: [packages/ai/src/types.ts:550](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L550)

Parsed `TOOL_CALL_END` input. Spec `TOOL_CALL_END` has no top-level `input`.

***

### interruptErrors?

```ts
optional interruptErrors?: readonly InterruptSubmissionError[];
```

Defined in: [packages/ai/src/types.ts:543](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L543)

***

### model?

```ts
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:539](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L539)

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:545](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L545)

***

### sessionId?

```ts
optional sessionId?: string;
```

Defined in: [packages/ai/src/types.ts:546](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L546)

***

### state?

```ts
optional state?: ToolOutputState;
```

Defined in: [packages/ai/src/types.ts:548](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L548)

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: [packages/ai/src/types.ts:544](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L544)

***

### usage?

```ts
optional usage?: TokenUsageLeftover;
```

Defined in: [packages/ai/src/types.ts:542](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L542)

TokenUsage fields that have no AG-UI `usage[]` equivalent.
