---
id: RunErrorEvent
title: RunErrorEvent
---

Defined in: [packages/ai/src/types.ts:1247](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1247)

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

Defined in: [packages/ai/src/types.ts:1260](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1260)

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

Defined in: [packages/ai/src/types.ts:1261](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1261)

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

Defined in: [packages/ai/src/types.ts:1258](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1258)

Restored on the client from `metadata.tanstack`.

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:1256](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1256)

Restored on the client from `metadata.tanstack`.

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: [packages/ai/src/types.ts:1254](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1254)

Restored on the client from `metadata.tanstack`.

***

### type

```ts
type: RUN_ERROR;
```

Defined in: [packages/ai/src/types.ts:1251](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1251)

***

### usage?

```ts
optional usage?: 
  | TokenUsage<ProviderUsageDetails>
  | SpecTokenUsage[];
```

Defined in: [packages/ai/src/types.ts:1252](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1252)
