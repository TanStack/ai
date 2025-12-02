---
id: ToolCallPart
title: ToolCallPart
---

# Interface: ToolCallPart

Defined in: [types.ts:30](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L30)

## Properties

### approval?

```ts
optional approval: object;
```

Defined in: [types.ts:37](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L37)

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

Defined in: [types.ts:34](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L34)

***

### id

```ts
id: string;
```

Defined in: [types.ts:32](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L32)

***

### name

```ts
name: string;
```

Defined in: [types.ts:33](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L33)

***

### output?

```ts
optional output: any;
```

Defined in: [types.ts:43](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L43)

Tool execution output (for client tools or after approval)

***

### state

```ts
state: ToolCallState;
```

Defined in: [types.ts:35](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L35)

***

### type

```ts
type: "tool-call";
```

Defined in: [types.ts:31](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L31)
