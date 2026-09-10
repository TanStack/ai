---
id: TanStackMessageMetadata
title: TanStackMessageMetadata
---

# Interface: TanStackMessageMetadata

Defined in: [packages/ai/src/types.ts:528](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L528)

Shape of `metadata.tanstack` on a message.
`createdAt` is an ISO-8601 string.

## Properties

### createdAt?

```ts
optional createdAt?: string;
```

Defined in: [packages/ai/src/types.ts:529](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L529)

***

### model?

```ts
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:530](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L530)

***

### signature?

```ts
optional signature?: string;
```

Defined in: [packages/ai/src/types.ts:532](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L532)

Thinking signature for a `role: 'reasoning'` fan-out message.

***

### structuredOutput?

```ts
optional structuredOutput?: object;
```

Defined in: [packages/ai/src/types.ts:540](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L540)

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

### toolCallMetadata?

```ts
optional toolCallMetadata?: Record<string, unknown>;
```

Defined in: [packages/ai/src/types.ts:534](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L534)

Per-tool-call provider metadata keyed by tool call id (e.g. Gemini thoughtSignature).

***

### toolResult?

```ts
optional toolResult?: object;
```

Defined in: [packages/ai/src/types.ts:535](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L535)

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

Defined in: [packages/ai/src/types.ts:548](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L548)
