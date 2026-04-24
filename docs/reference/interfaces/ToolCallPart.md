---
id: ToolCallPart
title: ToolCallPart
---

# Interface: ToolCallPart

Defined in: [packages/typescript/ai/src/types.ts:311](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L311)

## Properties

### approval?

```ts
optional approval: object;
```

Defined in: [packages/typescript/ai/src/types.ts:318](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L318)

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

Defined in: [packages/typescript/ai/src/types.ts:315](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L315)

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:313](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L313)

***

### name

```ts
name: string;
```

Defined in: [packages/typescript/ai/src/types.ts:314](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L314)

***

### output?

```ts
optional output: any;
```

Defined in: [packages/typescript/ai/src/types.ts:324](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L324)

Tool execution output (for client tools or after approval)

***

### state

```ts
state: ToolCallState;
```

Defined in: [packages/typescript/ai/src/types.ts:316](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L316)

***

### type

```ts
type: "tool-call";
```

Defined in: [packages/typescript/ai/src/types.ts:312](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L312)
