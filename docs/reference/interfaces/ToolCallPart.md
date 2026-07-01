---
id: ToolCallPart
title: ToolCallPart
---

# Interface: ToolCallPart\<TMetadata\>

Defined in: [packages/ai/src/types.ts:350](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L350)

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

## Properties

### approval?

```ts
optional approval: object;
```

Defined in: [packages/ai/src/types.ts:357](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L357)

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

Defined in: [packages/ai/src/types.ts:354](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L354)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:352](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L352)

***

### metadata?

```ts
optional metadata: TMetadata;
```

Defined in: [packages/ai/src/types.ts:366](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L366)

Provider-specific metadata that round-trips with the tool call.
Typed per-adapter via `TToolCallMetadata`.

***

### name

```ts
name: string;
```

Defined in: [packages/ai/src/types.ts:353](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L353)

***

### output?

```ts
optional output: any;
```

Defined in: [packages/ai/src/types.ts:363](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L363)

Tool execution output (for client tools or after approval)

***

### state

```ts
state: ToolCallState;
```

Defined in: [packages/ai/src/types.ts:355](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L355)

***

### type

```ts
type: "tool-call";
```

Defined in: [packages/ai/src/types.ts:351](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L351)
