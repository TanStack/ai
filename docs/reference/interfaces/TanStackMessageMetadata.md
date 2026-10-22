---
id: TanStackMessageMetadata
title: TanStackMessageMetadata
---

Defined in: packages/ai/src/types.ts:699

Shape of `metadata.tanstack` on a message.
`createdAt` is an ISO-8601 string.

## Properties

### continues?

```ts
optional continues?: string;
```

Defined in: packages/ai/src/types.ts:751

On an assistant wire row that exists only to keep the block order: the
id of the assistant row before it. Our server joins the two rows into
one message with a `blockOrder` map. See `uiMessagesToWire`.

***

### createdAt?

```ts
optional createdAt?: string;
```

Defined in: packages/ai/src/types.ts:700

***

### finishReason?

```ts
optional finishReason?: "length" | "stop" | "content_filter" | "tool_calls" | null;
```

Defined in: packages/ai/src/types.ts:709

Why the model call of this assistant message ended. A `'length'` message
stopped at the output limit, so its tool calls are not complete.

***

### model?

```ts
optional model?: string;
```

Defined in: packages/ai/src/types.ts:701

***

### responseId?

```ts
optional responseId?: string;
```

Defined in: packages/ai/src/types.ts:704

***

### responseItems?

```ts
optional responseItems?: object[];
```

Defined in: packages/ai/src/types.ts:715

The provider's answer items of this assistant message, in order, for a
same-model replay. The OpenAI Responses adapter keeps each output
message item's `id` and `phase` (`commentary` or `final_answer`).

#### id

```ts
id: string;
```

#### phase?

```ts
optional phase?: string;
```

***

### run?

```ts
optional run?: object;
```

Defined in: packages/ai/src/types.ts:723

The chat run that produced this assistant message. `withPersistence` sets
`id`. `reconstructChat` with `includeRuns: true` adds the finished run's
timings, in epoch ms.

#### finishedAt?

```ts
optional finishedAt?: number;
```

#### id

```ts
id: string;
```

#### startedAt?

```ts
optional startedAt?: number;
```

***

### runId?

```ts
optional runId?: string;
```

Defined in: packages/ai/src/types.ts:717

Parent chat run that produced this assistant message.

***

### signature?

```ts
optional signature?: string;
```

Defined in: packages/ai/src/types.ts:727

Thinking signature for a `role: 'reasoning'` fan-out message.

***

### source?

```ts
optional source?: MessageSource;
```

Defined in: packages/ai/src/types.ts:702

***

### stopReason?

```ts
optional stopReason?: "error" | "aborted";
```

Defined in: packages/ai/src/types.ts:703

***

### structuredOutput?

```ts
optional structuredOutput?: object;
```

Defined in: packages/ai/src/types.ts:737

#### data?

```ts
optional data?: unknown;
```

#### errorMessage?

```ts
optional errorMessage?: string;
```

#### partial?

```ts
optional partial?: unknown;
```

#### raw?

```ts
optional raw?: string;
```

#### reasoning?

```ts
optional reasoning?: string;
```

#### status?

```ts
optional status?: "error" | "complete" | "streaming";
```

***

### subagent?

```ts
optional subagent?: SubagentWireInfo;
```

Defined in: packages/ai/src/types.ts:725

Card data on a child wire message. See `uiMessagesToWire`.

***

### toolCallMetadata?

```ts
optional toolCallMetadata?: Record<string, unknown>;
```

Defined in: packages/ai/src/types.ts:729

Per-tool-call provider metadata keyed by tool call id (e.g. Gemini thoughtSignature).

***

### toolResult?

```ts
optional toolResult?: object;
```

Defined in: packages/ai/src/types.ts:730

#### content?

```ts
optional content?: ContentPart<unknown, unknown, unknown, unknown, unknown>[];
```

#### createdAt?

```ts
optional createdAt?: string;
```

#### id?

```ts
optional id?: string;
```

***

### toolResultOutcome?

```ts
optional toolResultOutcome?: ToolResultOutcome;
```

Defined in: packages/ai/src/types.ts:736

Outcome of a cancelled or denied tool result; when present, the UI state is `error`.

***

### uiResources?

```ts
optional uiResources?: UIResourcePart[];
```

Defined in: packages/ai/src/types.ts:745
