---
id: ToolCallPart
title: ToolCallPart
---

# Interface: ToolCallPart\<TMetadata\>

Defined in: [packages/ai/src/types.ts:348](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L348)

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

## Properties

### approval?

```ts
optional approval: object;
```

Defined in: [packages/ai/src/types.ts:355](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L355)

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

Defined in: [packages/ai/src/types.ts:352](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L352)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:350](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L350)

***

### metadata?

```ts
optional metadata: TMetadata;
```

Defined in: [packages/ai/src/types.ts:364](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L364)

Provider-specific metadata that round-trips with the tool call.
Typed per-adapter via `TToolCallMetadata`.

***

### name

```ts
name: string;
```

Defined in: [packages/ai/src/types.ts:351](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L351)

***

### output?

```ts
optional output: any;
```

Defined in: [packages/ai/src/types.ts:361](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L361)

Tool execution output (for client tools or after approval)

***

### state

```ts
state: ToolCallState;
```

Defined in: [packages/ai/src/types.ts:353](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L353)

***

### type

```ts
type: "tool-call";
```

Defined in: [packages/ai/src/types.ts:349](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L349)
