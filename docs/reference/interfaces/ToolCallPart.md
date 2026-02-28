---
id: ToolCallPart
title: ToolCallPart
---

# Interface: ToolCallPart

Defined in: [types.ts:282](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L282)

## Properties

### approval?

```ts
optional approval: object;
```

Defined in: [types.ts:289](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L289)

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

Defined in: [types.ts:286](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L286)

***

### id

```ts
id: string;
```

Defined in: [types.ts:284](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L284)

***

### name

```ts
name: string;
```

Defined in: [types.ts:285](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L285)

***

### output?

```ts
optional output: any;
```

Defined in: [types.ts:295](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L295)

Tool execution output (for client tools or after approval)

***

### state

```ts
state: ToolCallState;
```

Defined in: [types.ts:287](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L287)

***

### type

```ts
type: "tool-call";
```

Defined in: [types.ts:283](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L283)
