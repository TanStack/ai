---
id: ToolCallPart
title: ToolCallPart
---

# Interface: ToolCallPart\<TMetadata\>

Defined in: [packages/typescript/ai/src/types.ts:335](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L335)

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

## Properties

### approval?

```ts
optional approval: object;
```

Defined in: [packages/typescript/ai/src/types.ts:342](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L342)

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

Defined in: [packages/typescript/ai/src/types.ts:339](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L339)

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:337](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L337)

***

### metadata?

```ts
optional metadata: TMetadata;
```

Defined in: [packages/typescript/ai/src/types.ts:351](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L351)

Provider-specific metadata that round-trips with the tool call.
Typed per-adapter via `TToolCallMetadata`.

***

### name

```ts
name: string;
```

Defined in: [packages/typescript/ai/src/types.ts:338](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L338)

***

### output?

```ts
optional output: any;
```

Defined in: [packages/typescript/ai/src/types.ts:348](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L348)

Tool execution output (for client tools or after approval)

***

### state

```ts
state: ToolCallState;
```

Defined in: [packages/typescript/ai/src/types.ts:340](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L340)

***

### type

```ts
type: "tool-call";
```

Defined in: [packages/typescript/ai/src/types.ts:336](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L336)
