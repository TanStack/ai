---
id: CodeModeConsoleEvent
title: CodeModeConsoleEvent
---

Defined in: [packages/ai/src/types.ts:1513](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1513)

Custom event for extensibility.

@ag-ui/core provides: `name`, `value`

Uses `Pick` (not `extends`) so the Zod passthrough index signature does not
erase discriminant property access on [KnownCustomEvent](../type-aliases/KnownCustomEvent.md) unions.

## Extends

- [`CustomEvent`](CustomEvent.md)

## Properties

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1390](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1390)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`metadata`](CustomEvent.md#metadata)

***

### name

```ts
name: "code_mode:console";
```

Defined in: [packages/ai/src/types.ts:1514](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1514)

#### Overrides

```ts
CustomEvent.name
```

***

### type

```ts
type: "CUSTOM";
```

Defined in: [packages/ai/src/types.ts:1389](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1389)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1515](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1515)

#### level

```ts
level: "error" | "info" | "warn" | "log";
```

#### message

```ts
message: string;
```

#### timestamp

```ts
timestamp: number;
```

#### Overrides

```ts
CustomEvent.value
```
