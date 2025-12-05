---
id: ToolCallPart
title: ToolCallPart
---

# Interface: ToolCallPart

Defined in: [types.ts:193](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L193)

## Properties

### approval?

```ts
optional approval: object;
```

Defined in: [types.ts:200](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L200)

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

Defined in: [types.ts:197](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L197)

***

### id

```ts
id: string;
```

Defined in: [types.ts:195](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L195)

***

### name

```ts
name: string;
```

Defined in: [types.ts:196](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L196)

***

### output?

```ts
optional output: any;
```

Defined in: [types.ts:206](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L206)

Tool execution output (for client tools or after approval)

***

### state

```ts
state: ToolCallState;
```

Defined in: [types.ts:198](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L198)

***

### type

```ts
type: "tool-call";
```

Defined in: [types.ts:194](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L194)
