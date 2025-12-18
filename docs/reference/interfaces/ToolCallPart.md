---
id: ToolCallPart
title: ToolCallPart
---

# Interface: ToolCallPart

Defined in: [types.ts:305](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L305)

## Properties

### approval?

```ts
optional approval: object;
```

Defined in: [types.ts:312](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L312)

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

Defined in: [types.ts:309](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L309)

***

### id

```ts
id: string;
```

Defined in: [types.ts:307](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L307)

***

### name

```ts
name: string;
```

Defined in: [types.ts:308](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L308)

***

### output?

```ts
optional output: any;
```

Defined in: [types.ts:318](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L318)

Tool execution output (for client tools or after approval)

***

### state

```ts
state: ToolCallState;
```

Defined in: [types.ts:310](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L310)

***

### type

```ts
type: "tool-call";
```

Defined in: [types.ts:306](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L306)
