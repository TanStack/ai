---
id: ToolCallPart
title: ToolCallPart
---

# Interface: ToolCallPart\<TMetadata\>

Defined in: [packages/ai/src/types.ts:370](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L370)

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

## Properties

### approval?

```ts
optional approval: object;
```

Defined in: [packages/ai/src/types.ts:377](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L377)

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

Defined in: [packages/ai/src/types.ts:374](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L374)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:372](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L372)

***

### metadata?

```ts
optional metadata: TMetadata;
```

Defined in: [packages/ai/src/types.ts:388](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L388)

Provider-specific metadata that round-trips with the tool call.
Typed per-adapter via `TToolCallMetadata`. May follow the
[ProviderExecutedToolMetadata](ProviderExecutedToolMetadata.md) convention to mark provider-executed
server tools (e.g. Anthropic `web_search`).

***

### name

```ts
name: string;
```

Defined in: [packages/ai/src/types.ts:373](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L373)

***

### output?

```ts
optional output: any;
```

Defined in: [packages/ai/src/types.ts:383](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L383)

Tool execution output (for client tools or after approval)

***

### state

```ts
state: ToolCallState;
```

Defined in: [packages/ai/src/types.ts:375](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L375)

***

### type

```ts
type: "tool-call";
```

Defined in: [packages/ai/src/types.ts:371](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L371)
