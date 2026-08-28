---
id: RunErrorEvent
title: RunErrorEvent
---

# Interface: RunErrorEvent

Defined in: [packages/ai/src/types.ts:1225](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1225)

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

Defined in: [packages/ai/src/types.ts:1238](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1238)

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

Defined in: [packages/ai/src/types.ts:1239](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1239)

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

Defined in: [packages/ai/src/types.ts:1236](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1236)

Restored on the client from `metadata.tanstack`.

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:1234](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1234)

Restored on the client from `metadata.tanstack`.

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: [packages/ai/src/types.ts:1232](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1232)

Restored on the client from `metadata.tanstack`.

***

### type

```ts
type: RUN_ERROR;
```

Defined in: [packages/ai/src/types.ts:1229](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1229)

***

### usage?

```ts
optional usage?: 
  | TokenUsage<ProviderUsageDetails>
  | SpecTokenUsage[];
```

Defined in: [packages/ai/src/types.ts:1230](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1230)
