---
id: ToolCallPart
title: ToolCallPart
---

# Interface: ToolCallPart\<TMetadata\>

Defined in: [packages/ai/src/types.ts:338](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L338)

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

## Properties

### approval?

```ts
optional approval: object;
```

Defined in: [packages/ai/src/types.ts:345](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L345)

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

Defined in: [packages/ai/src/types.ts:342](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L342)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:340](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L340)

***

### metadata?

```ts
optional metadata: TMetadata;
```

Defined in: [packages/ai/src/types.ts:354](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L354)

Provider-specific metadata that round-trips with the tool call.
Typed per-adapter via `TToolCallMetadata`.

***

### name

```ts
name: string;
```

Defined in: [packages/ai/src/types.ts:341](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L341)

***

### output?

```ts
optional output: any;
```

Defined in: [packages/ai/src/types.ts:351](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L351)

Tool execution output (for client tools or after approval)

***

### state

```ts
state: ToolCallState;
```

Defined in: [packages/ai/src/types.ts:343](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L343)

***

### type

```ts
type: "tool-call";
```

Defined in: [packages/ai/src/types.ts:339](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L339)
