---
id: ToolCallPart
title: ToolCallPart
---

# Interface: ToolCallPart

Defined in: [types.ts:242](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L242)

## Properties

### approval?

```ts
optional approval: object;
```

Defined in: [types.ts:249](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L249)

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

Defined in: [types.ts:246](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L246)

***

### id

```ts
id: string;
```

Defined in: [types.ts:244](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L244)

***

### name

```ts
name: string;
```

Defined in: [types.ts:245](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L245)

***

### output?

```ts
optional output: any;
```

Defined in: [types.ts:255](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L255)

Tool execution output (for client tools or after approval)

***

### state

```ts
state: ToolCallState;
```

Defined in: [types.ts:247](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L247)

***

### type

```ts
type: "tool-call";
```

Defined in: [types.ts:243](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L243)
