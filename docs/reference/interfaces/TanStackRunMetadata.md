---
id: TanStackRunMetadata
title: TanStackRunMetadata
---

Defined in: [packages/ai/src/types.ts:572](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L572)

Shape of `metadata.tanstack` on run events.

## Properties

### finishReason?

```ts
optional finishReason?: "length" | "stop" | "content_filter" | "tool_calls" | null;
```

Defined in: [packages/ai/src/types.ts:574](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L574)

***

### index?

```ts
optional index?: number;
```

Defined in: [packages/ai/src/types.ts:581](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L581)

***

### input?

```ts
optional input?: unknown;
```

Defined in: [packages/ai/src/types.ts:584](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L584)

Parsed `TOOL_CALL_END` input. Spec `TOOL_CALL_END` has no top-level `input`.

***

### interruptErrors?

```ts
optional interruptErrors?: readonly InterruptSubmissionError[];
```

Defined in: [packages/ai/src/types.ts:577](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L577)

***

### model?

```ts
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:573](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L573)

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:579](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L579)

***

### sessionId?

```ts
optional sessionId?: string;
```

Defined in: [packages/ai/src/types.ts:580](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L580)

***

### state?

```ts
optional state?: ToolOutputState;
```

Defined in: [packages/ai/src/types.ts:582](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L582)

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: [packages/ai/src/types.ts:578](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L578)

***

### usage?

```ts
optional usage?: TokenUsageLeftover;
```

Defined in: [packages/ai/src/types.ts:576](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L576)

TokenUsage fields that have no AG-UI `usage[]` equivalent.
