---
id: ToolCallPart
title: ToolCallPart
---

# Interface: ToolCallPart

Defined in: [types.ts:180](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L180)

## Properties

### approval?

```ts
optional approval: object;
```

Defined in: [types.ts:187](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L187)

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

Defined in: [types.ts:184](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L184)

***

### id

```ts
id: string;
```

Defined in: [types.ts:182](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L182)

***

### name

```ts
name: string;
```

Defined in: [types.ts:183](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L183)

***

### output?

```ts
optional output: any;
```

Defined in: [types.ts:193](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L193)

Tool execution output (for client tools or after approval)

***

### state

```ts
state: ToolCallState;
```

Defined in: [types.ts:185](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L185)

***

### type

```ts
type: "tool-call";
```

Defined in: [types.ts:181](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L181)
