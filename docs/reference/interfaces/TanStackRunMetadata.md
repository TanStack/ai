---
id: TanStackRunMetadata
title: TanStackRunMetadata
---

Defined in: [packages/ai/src/types.ts:588](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L588)

Shape of `metadata.tanstack` on run events.

## Properties

### finishReason?

```ts
optional finishReason?: "length" | "stop" | "content_filter" | "tool_calls" | null;
```

Defined in: [packages/ai/src/types.ts:590](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L590)

***

### index?

```ts
optional index?: number;
```

Defined in: [packages/ai/src/types.ts:597](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L597)

***

### input?

```ts
optional input?: unknown;
```

Defined in: [packages/ai/src/types.ts:600](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L600)

Parsed `TOOL_CALL_END` input. Spec `TOOL_CALL_END` has no top-level `input`.

***

### interruptErrors?

```ts
optional interruptErrors?: readonly InterruptSubmissionError[];
```

Defined in: [packages/ai/src/types.ts:593](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L593)

***

### model?

```ts
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:589](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L589)

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:595](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L595)

***

### sessionId?

```ts
optional sessionId?: string;
```

Defined in: [packages/ai/src/types.ts:596](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L596)

***

### state?

```ts
optional state?: ToolOutputState;
```

Defined in: [packages/ai/src/types.ts:598](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L598)

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: [packages/ai/src/types.ts:594](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L594)

***

### usage?

```ts
optional usage?: TokenUsageLeftover;
```

Defined in: [packages/ai/src/types.ts:592](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L592)

TokenUsage fields that have no AG-UI `usage[]` equivalent.
