---
id: RunErrorEvent
title: RunErrorEvent
---

Defined in: [packages/ai/src/types.ts:1271](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1271)

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

Defined in: [packages/ai/src/types.ts:1284](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1284)

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

Defined in: [packages/ai/src/types.ts:1285](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1285)

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

Defined in: [packages/ai/src/types.ts:1282](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1282)

Restored on the client from `metadata.tanstack`.

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:1280](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1280)

Restored on the client from `metadata.tanstack`.

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: [packages/ai/src/types.ts:1278](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1278)

Restored on the client from `metadata.tanstack`.

***

### type

```ts
type: RUN_ERROR;
```

Defined in: [packages/ai/src/types.ts:1275](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1275)

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails> | TokenUsage[];
```

Defined in: [packages/ai/src/types.ts:1276](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1276)
