---
id: ToolCallPart
title: ToolCallPart
---

# Interface: ToolCallPart\<TMetadata\>

Defined in: [packages/typescript/ai/src/types.ts:314](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L314)

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

## Properties

### approval?

```ts
optional approval: object;
```

Defined in: [packages/typescript/ai/src/types.ts:321](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L321)

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

Defined in: [packages/typescript/ai/src/types.ts:318](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L318)

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:316](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L316)

***

### metadata?

```ts
optional metadata: TMetadata;
```

Defined in: [packages/typescript/ai/src/types.ts:330](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L330)

Provider-specific metadata that round-trips with the tool call.
Typed per-adapter via `TToolCallMetadata`.

***

### name

```ts
name: string;
```

Defined in: [packages/typescript/ai/src/types.ts:317](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L317)

***

### output?

```ts
optional output: any;
```

Defined in: [packages/typescript/ai/src/types.ts:327](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L327)

Tool execution output (for client tools or after approval)

***

### state

```ts
state: ToolCallState;
```

Defined in: [packages/typescript/ai/src/types.ts:319](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L319)

***

### type

```ts
type: "tool-call";
```

Defined in: [packages/typescript/ai/src/types.ts:315](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L315)
