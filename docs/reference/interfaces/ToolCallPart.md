---
id: ToolCallPart
title: ToolCallPart
---

# Interface: ToolCallPart

Defined in: [types.ts:185](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L185)

## Properties

### approval?

```ts
optional approval: object;
```

Defined in: [types.ts:192](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L192)

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

Defined in: [types.ts:189](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L189)

***

### id

```ts
id: string;
```

Defined in: [types.ts:187](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L187)

***

### name

```ts
name: string;
```

Defined in: [types.ts:188](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L188)

***

### output?

```ts
optional output: any;
```

Defined in: [types.ts:198](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L198)

Tool execution output (for client tools or after approval)

***

### state

```ts
state: ToolCallState;
```

Defined in: [types.ts:190](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L190)

***

### type

```ts
type: "tool-call";
```

Defined in: [types.ts:186](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L186)
