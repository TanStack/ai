---
id: AdapterYieldChunk
title: AdapterYieldChunk
---

# Type Alias: AdapterYieldChunk

```ts
type AdapterYieldChunk = StreamChunk & object;
```

Defined in: [packages/ai/src/utilities/adapter-yield-chunk.ts:8](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/adapter-yield-chunk.ts#L8)

Adapter / engine yield before normalize. Public StreamChunk is spec-only.
This type still allows the old extra fields.

## Type Declaration

### args?

```ts
optional args?: string;
```

### content?

```ts
optional content?: string;
```

### delta?

```ts
optional delta?: string | ReadonlyArray<unknown>;
```

### error?

```ts
optional error?: object;
```

#### error.code?

```ts
optional code?: string;
```

#### error.message

```ts
message: string;
```

### finishReason?

```ts
optional finishReason?: "stop" | "length" | "content_filter" | "tool_calls" | null;
```

### index?

```ts
optional index?: number;
```

### input?

```ts
optional input?: unknown;
```

### model?

```ts
optional model?: string;
```

### output?

```ts
optional output?: unknown;
```

### result?

```ts
optional result?: string | ContentPart[];
```

### runId?

```ts
optional runId?: string;
```

### signature?

```ts
optional signature?: string;
```

### state?

```ts
optional state?: ToolOutputState | Record<string, unknown>;
```

### stepId?

```ts
optional stepId?: string;
```

### stepType?

```ts
optional stepType?: string;
```

### tanstack:interruptErrors?

```ts
optional tanstack:interruptErrors?: ReadonlyArray<InterruptSubmissionError>;
```

### threadId?

```ts
optional threadId?: string;
```

### toolCallName?

```ts
optional toolCallName?: string;
```

### toolName?

```ts
optional toolName?: string;
```

### usage?

```ts
optional usage?: any;
```
