---
id: SandboxStartingEvent
title: SandboxStartingEvent
---

Defined in: [packages/ai/src/types.ts:1897](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1897)

`withSandbox` sends this before it creates or resumes the sandbox.

## Extends

- [`CustomEvent`](CustomEvent.md)

## Properties

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1829](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1829)

Extra information attached to this event.

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`metadata`](CustomEvent.md#metadata)

***

### name

```ts
name: "sandbox.starting";
```

Defined in: [packages/ai/src/types.ts:1898](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1898)

What this custom event is. Required: without it a consumer cannot route
the value.

#### Overrides

```ts
CustomEvent.name
```

***

### type

```ts
type: "CUSTOM";
```

Defined in: [packages/ai/src/types.ts:1828](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1828)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1899](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1899)

The payload. Any JSON value, and required.

#### provider

```ts
provider: string;
```

#### Overrides

```ts
CustomEvent.value
```
