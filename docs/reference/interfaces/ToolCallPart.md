---
id: ToolCallPart
title: ToolCallPart
---

# Interface: ToolCallPart

Defined in: [types.ts:254](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L254)

## Properties

### approval?

```ts
optional approval: object;
```

Defined in: [types.ts:261](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L261)

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

Defined in: [types.ts:258](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L258)

***

### id

```ts
id: string;
```

Defined in: [types.ts:256](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L256)

***

### name

```ts
name: string;
```

Defined in: [types.ts:257](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L257)

***

### output?

```ts
optional output: any;
```

Defined in: [types.ts:267](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L267)

Tool execution output (for client tools or after approval)

***

### state

```ts
state: ToolCallState;
```

Defined in: [types.ts:259](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L259)

***

### type

```ts
type: "tool-call";
```

Defined in: [types.ts:255](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L255)
