---
id: TanStackMessageMetadata
title: TanStackMessageMetadata
---

Defined in: [packages/ai/src/types.ts:542](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L542)

Shape of `metadata.tanstack` on a message.
`createdAt` is an ISO-8601 string.

## Properties

### createdAt?

```ts
optional createdAt?: string;
```

Defined in: [packages/ai/src/types.ts:543](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L543)

***

### model?

```ts
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:544](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L544)

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:546](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L546)

Parent chat run that produced this assistant message.

***

### signature?

```ts
optional signature?: string;
```

Defined in: [packages/ai/src/types.ts:550](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L550)

Thinking signature for a `role: 'reasoning'` fan-out message.

***

### structuredOutput?

```ts
optional structuredOutput?: object;
```

Defined in: [packages/ai/src/types.ts:558](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L558)

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

Defined in: [packages/ai/src/types.ts:548](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L548)

Card data on a child wire message. See `uiMessagesToWire`.

***

### toolCallMetadata?

```ts
optional toolCallMetadata?: Record<string, unknown>;
```

Defined in: [packages/ai/src/types.ts:552](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L552)

Per-tool-call provider metadata keyed by tool call id (e.g. Gemini thoughtSignature).

***

### toolResult?

```ts
optional toolResult?: object;
```

Defined in: [packages/ai/src/types.ts:553](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L553)

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

### uiResources?

```ts
optional uiResources?: UIResourcePart[];
```

Defined in: [packages/ai/src/types.ts:566](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L566)
