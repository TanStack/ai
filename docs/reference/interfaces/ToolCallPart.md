---
id: ToolCallPart
title: ToolCallPart
---

Defined in: [packages/ai/src/types.ts:426](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L426)

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

## Properties

### approval?

```ts
optional approval?: object;
```

Defined in: [packages/ai/src/types.ts:442](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L442)

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

Defined in: [packages/ai/src/types.ts:430](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L430)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:428](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L428)

***

### input?

```ts
optional input?: unknown;
```

Defined in: [packages/ai/src/types.ts:439](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L439)

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

Defined in: [packages/ai/src/types.ts:453](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L453)

Provider-specific metadata that round-trips with the tool call.
Typed per-adapter via `TToolCallMetadata`. May follow the
[ProviderExecutedToolMetadata](ProviderExecutedToolMetadata.md) convention to mark provider-executed
server tools (e.g. Anthropic `web_search`).

***

### name

```ts
name: string;
```

Defined in: [packages/ai/src/types.ts:429](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L429)

***

### output?

```ts
optional output?: any;
```

Defined in: [packages/ai/src/types.ts:448](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L448)

Tool execution output (for client tools or after approval)

***

### state

```ts
state: ToolCallState;
```

Defined in: [packages/ai/src/types.ts:440](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L440)

***

### type

```ts
type: "tool-call";
```

Defined in: [packages/ai/src/types.ts:427](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L427)
