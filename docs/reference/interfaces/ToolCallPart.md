---
id: ToolCallPart
title: ToolCallPart
---

# Interface: ToolCallPart

Defined in: [types.ts:188](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L188)

## Properties

### approval?

```ts
optional approval: object;
```

Defined in: [types.ts:195](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L195)

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

Defined in: [types.ts:192](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L192)

***

### id

```ts
id: string;
```

Defined in: [types.ts:190](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L190)

***

### name

```ts
name: string;
```

Defined in: [types.ts:191](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L191)

***

### output?

```ts
optional output: any;
```

Defined in: [types.ts:201](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L201)

Tool execution output (for client tools or after approval)

***

### state

```ts
state: ToolCallState;
```

Defined in: [types.ts:193](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L193)

***

### type

```ts
type: "tool-call";
```

Defined in: [types.ts:189](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L189)
