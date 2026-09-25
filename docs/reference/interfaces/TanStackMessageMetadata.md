---
id: TanStackMessageMetadata
title: TanStackMessageMetadata
---

Defined in: [packages/ai/src/types.ts:558](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L558)

Shape of `metadata.tanstack` on a message.
`createdAt` is an ISO-8601 string.

## Properties

### createdAt?

```ts
optional createdAt?: string;
```

Defined in: [packages/ai/src/types.ts:559](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L559)

***

### model?

```ts
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:560](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L560)

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:562](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L562)

Parent chat run that produced this assistant message.

***

### signature?

```ts
optional signature?: string;
```

Defined in: [packages/ai/src/types.ts:566](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L566)

Thinking signature for a `role: 'reasoning'` fan-out message.

***

### structuredOutput?

```ts
optional structuredOutput?: object;
```

Defined in: [packages/ai/src/types.ts:574](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L574)

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

Defined in: [packages/ai/src/types.ts:564](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L564)

Card data on a child wire message. See `uiMessagesToWire`.

***

### toolCallMetadata?

```ts
optional toolCallMetadata?: Record<string, unknown>;
```

Defined in: [packages/ai/src/types.ts:568](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L568)

Per-tool-call provider metadata keyed by tool call id (e.g. Gemini thoughtSignature).

***

### toolResult?

```ts
optional toolResult?: object;
```

Defined in: [packages/ai/src/types.ts:569](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L569)

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

Defined in: [packages/ai/src/types.ts:582](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L582)
