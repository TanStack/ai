---
id: ToolCallPart
title: ToolCallPart
---

# Interface: ToolCallPart\<TMetadata\>

Defined in: [packages/ai/src/types.ts:373](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L373)

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

## Properties

### approval?

```ts
optional approval: object;
```

Defined in: [packages/ai/src/types.ts:380](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L380)

Approval metadata if tool requires user approval

#### approved?

```ts
optional approved: boolean;
```

#### id

```ts
id: string;
```

#### needsApproval

```ts
needsApproval: boolean;
```

***

### arguments

```ts
arguments: string;
```

Defined in: [packages/ai/src/types.ts:377](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L377)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:375](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L375)

***

### metadata?

```ts
optional metadata: TMetadata;
```

Defined in: [packages/ai/src/types.ts:391](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L391)

Provider-specific metadata that round-trips with the tool call.
Typed per-adapter via `TToolCallMetadata`. May follow the
[ProviderExecutedToolMetadata](ProviderExecutedToolMetadata.md) convention to mark provider-executed
server tools (e.g. Anthropic `web_search`).

***

### name

```ts
name: string;
```

Defined in: [packages/ai/src/types.ts:376](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L376)

***

### output?

```ts
optional output: any;
```

Defined in: [packages/ai/src/types.ts:386](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L386)

Tool execution output (for client tools or after approval)

***

### state

```ts
state: ToolCallState;
```

Defined in: [packages/ai/src/types.ts:378](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L378)

***

### type

```ts
type: "tool-call";
```

Defined in: [packages/ai/src/types.ts:374](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L374)
