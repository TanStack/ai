---
id: TanStackMessageMetadata
title: TanStackMessageMetadata
---

Defined in: [packages/ai/src/types.ts:624](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L624)

Shape of `metadata.tanstack` on a message.
`createdAt` is an ISO-8601 string.

## Properties

### createdAt?

```ts
optional createdAt?: string;
```

Defined in: [packages/ai/src/types.ts:625](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L625)

***

### model?

```ts
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:626](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L626)

***

### run?

```ts
optional run?: object;
```

Defined in: [packages/ai/src/types.ts:634](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L634)

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

Defined in: [packages/ai/src/types.ts:628](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L628)

Parent chat run that produced this assistant message.

***

### signature?

```ts
optional signature?: string;
```

Defined in: [packages/ai/src/types.ts:638](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L638)

Thinking signature for a `role: 'reasoning'` fan-out message.

***

### structuredOutput?

```ts
optional structuredOutput?: object;
```

Defined in: [packages/ai/src/types.ts:648](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L648)

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

Defined in: [packages/ai/src/types.ts:636](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L636)

Card data on a child wire message. See `uiMessagesToWire`.

***

### toolCallMetadata?

```ts
optional toolCallMetadata?: Record<string, unknown>;
```

Defined in: [packages/ai/src/types.ts:640](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L640)

Per-tool-call provider metadata keyed by tool call id (e.g. Gemini thoughtSignature).

***

### toolResult?

```ts
optional toolResult?: object;
```

Defined in: [packages/ai/src/types.ts:641](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L641)

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

Defined in: [packages/ai/src/types.ts:647](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L647)

Outcome of a cancelled or denied tool result; when present, the UI state is `error`.

***

### uiResources?

```ts
optional uiResources?: UIResourcePart[];
```

Defined in: [packages/ai/src/types.ts:656](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L656)
