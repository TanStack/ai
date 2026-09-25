---
id: RunErrorEvent
title: RunErrorEvent
---

Defined in: [packages/ai/src/types.ts:1287](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1287)

Emitted when an error occurs during a run.

@ag-ui/core provides: `message`, `code?`
Spec `usage[]` is provider/model token counts. Interrupt errors live in
`metadata.tanstack.interruptErrors`.

## Extends

- `Pick`\<`AGUIRunErrorEvent`, `"message"` \| `"code"` \| `"timestamp"` \| `"rawEvent"`\>

## Properties

### error?

```ts
optional error?: object;
```

Defined in: [packages/ai/src/types.ts:1300](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1300)

Nested payload kept for in-process / durability consumers.

#### code?

```ts
optional code?: string;
```

#### message

```ts
message: string;
```

***

### metadata?

```ts
optional metadata?: object & Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1301](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1301)

#### Type Declaration

##### tanstack?

```ts
optional tanstack?: TanStackRunMetadata;
```

***

### model?

```ts
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:1298](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1298)

Restored on the client from `metadata.tanstack`.

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:1296](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1296)

Restored on the client from `metadata.tanstack`.

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: [packages/ai/src/types.ts:1294](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1294)

Restored on the client from `metadata.tanstack`.

***

### type

```ts
type: RUN_ERROR;
```

Defined in: [packages/ai/src/types.ts:1291](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1291)

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails> | TokenUsage[];
```

Defined in: [packages/ai/src/types.ts:1292](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1292)
