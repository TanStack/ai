---
id: RunErrorEvent
title: RunErrorEvent
---

# Interface: RunErrorEvent

Defined in: [packages/ai/src/types.ts:1207](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1207)

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

Defined in: [packages/ai/src/types.ts:1220](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1220)

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

Defined in: [packages/ai/src/types.ts:1221](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1221)

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

Defined in: [packages/ai/src/types.ts:1218](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1218)

Restored on the client from `metadata.tanstack`.

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:1216](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1216)

Restored on the client from `metadata.tanstack`.

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: [packages/ai/src/types.ts:1214](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1214)

Restored on the client from `metadata.tanstack`.

***

### type

```ts
type: RUN_ERROR;
```

Defined in: [packages/ai/src/types.ts:1211](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1211)

***

### usage?

```ts
optional usage?: 
  | TokenUsage<ProviderUsageDetails>
  | SpecTokenUsage[];
```

Defined in: [packages/ai/src/types.ts:1212](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1212)
