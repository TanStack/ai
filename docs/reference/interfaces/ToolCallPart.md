---
id: ToolCallPart
title: ToolCallPart
---

# Interface: ToolCallPart\<TMetadata\>

Defined in: [packages/ai/src/types.ts:397](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L397)

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

## Properties

### approval?

```ts
optional approval?: object;
```

Defined in: [packages/ai/src/types.ts:413](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L413)

Approval metadata if tool requires user approval

#### approved?

```ts
optional approved?: boolean;
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

Defined in: [packages/ai/src/types.ts:401](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L401)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:399](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L399)

***

### input?

```ts
optional input?: unknown;
```

Defined in: [packages/ai/src/types.ts:410](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L410)

Parsed tool input. Set from the parsed arguments once they are complete
(`state: 'input-complete'` and later). `undefined` while the raw
`arguments` string is still streaming, and may stay `undefined` for a call
that terminates in an error state — the raw `arguments` string is always
available as a fallback. Typed per-tool on the client `ToolCallPart` (see
`@tanstack/ai-client`); `unknown` on this base type.

***

### metadata?

```ts
optional metadata?: TMetadata;
```

Defined in: [packages/ai/src/types.ts:424](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L424)

Provider-specific metadata that round-trips with the tool call.
Typed per-adapter via `TToolCallMetadata`. May follow the
[ProviderExecutedToolMetadata](ProviderExecutedToolMetadata.md) convention to mark provider-executed
server tools (e.g. Anthropic `web_search`).

***

### name

```ts
name: string;
```

Defined in: [packages/ai/src/types.ts:400](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L400)

***

### output?

```ts
optional output?: any;
```

Defined in: [packages/ai/src/types.ts:419](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L419)

Tool execution output (for client tools or after approval)

***

### state

```ts
state: ToolCallState;
```

Defined in: [packages/ai/src/types.ts:411](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L411)

***

### type

```ts
type: "tool-call";
```

Defined in: [packages/ai/src/types.ts:398](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L398)
