---
id: TanStackMessageMetadata
title: TanStackMessageMetadata
---

Defined in: [packages/ai/src/types.ts:702](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L702)

Shape of `metadata.tanstack` on a message.
`createdAt` is an ISO-8601 string.

## Properties

### continues?

```ts
optional continues?: string;
```

Defined in: [packages/ai/src/types.ts:761](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L761)

On an assistant wire row that exists only to keep the block order: the
id of the assistant row before it. Our server joins the two rows into
one message with a `blockOrder` map. See `uiMessagesToWire`.

***

### createdAt?

```ts
optional createdAt?: string;
```

Defined in: [packages/ai/src/types.ts:703](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L703)

***

### finishReason?

```ts
optional finishReason?: "length" | "stop" | "content_filter" | "tool_calls" | null;
```

Defined in: [packages/ai/src/types.ts:712](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L712)

Why the model call of this assistant message ended. A `'length'` message
stopped at the output limit, so its tool calls are not complete.

***

### model?

```ts
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:704](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L704)

***

### reasoningItem?

```ts
optional reasoningItem?: boolean;
```

Defined in: [packages/ai/src/types.ts:725](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L725)

The model call of this assistant message sent a reasoning item. The
OpenAI Responses adapter sets it. A replay that lost that reasoning item
sends the message without its item ids, because the API refuses a
`msg_`/`fc_` item without the reasoning item that made it.

***

### responseId?

```ts
optional responseId?: string;
```

Defined in: [packages/ai/src/types.ts:707](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L707)

***

### responseItems?

```ts
optional responseItems?: object[];
```

Defined in: [packages/ai/src/types.ts:718](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L718)

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

Defined in: [packages/ai/src/types.ts:733](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L733)

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

Defined in: [packages/ai/src/types.ts:727](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L727)

Parent chat run that produced this assistant message.

***

### signature?

```ts
optional signature?: string;
```

Defined in: [packages/ai/src/types.ts:737](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L737)

Thinking signature for a `role: 'reasoning'` fan-out message.

***

### source?

```ts
optional source?: MessageSource;
```

Defined in: [packages/ai/src/types.ts:705](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L705)

***

### stopReason?

```ts
optional stopReason?: "error" | "aborted";
```

Defined in: [packages/ai/src/types.ts:706](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L706)

***

### structuredOutput?

```ts
optional structuredOutput?: object;
```

Defined in: [packages/ai/src/types.ts:747](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L747)

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

Defined in: [packages/ai/src/types.ts:735](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L735)

Card data on a child wire message. See `uiMessagesToWire`.

***

### toolCallMetadata?

```ts
optional toolCallMetadata?: Record<string, unknown>;
```

Defined in: [packages/ai/src/types.ts:739](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L739)

Per-tool-call provider metadata keyed by tool call id (e.g. Gemini thoughtSignature).

***

### toolResult?

```ts
optional toolResult?: object;
```

Defined in: [packages/ai/src/types.ts:740](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L740)

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

Defined in: [packages/ai/src/types.ts:746](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L746)

Outcome of a cancelled or denied tool result; when present, the UI state is `error`.

***

### uiResources?

```ts
optional uiResources?: UIResourcePart[];
```

Defined in: [packages/ai/src/types.ts:755](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L755)
