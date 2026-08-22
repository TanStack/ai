---
id: TanStackMessageMetadata
title: TanStackMessageMetadata
---

# Interface: TanStackMessageMetadata

Defined in: [packages/ai/src/types.ts:520](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L520)

Shape of `metadata.tanstack` on a message.
`createdAt` is an ISO-8601 string.

## Properties

### createdAt?

```ts
optional createdAt?: string;
```

Defined in: [packages/ai/src/types.ts:521](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L521)

***

### model?

```ts
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:522](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L522)

***

### signature?

```ts
optional signature?: string;
```

Defined in: [packages/ai/src/types.ts:524](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L524)

Thinking signature for a `role: 'reasoning'` fan-out message.

***

### structuredOutput?

```ts
optional structuredOutput?: object;
```

Defined in: [packages/ai/src/types.ts:527](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L527)

#### errorMessage?

```ts
optional errorMessage?: string;
```

#### raw?

```ts
optional raw?: string;
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

Defined in: [packages/ai/src/types.ts:526](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L526)

Per-tool-call provider metadata keyed by tool call id (e.g. Gemini thoughtSignature).

***

### uiResources?

```ts
optional uiResources?: UIResourcePart[];
```

Defined in: [packages/ai/src/types.ts:532](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L532)
