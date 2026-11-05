---
id: SandboxStartingEvent
title: SandboxStartingEvent
---

Defined in: [packages/ai/src/types.ts:1882](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1882)

`withSandbox` sends this before it creates or resumes the sandbox.

## Extends

- [`CustomEvent`](CustomEvent.md)

## Properties

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1814](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1814)

Extra information attached to this event.

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`metadata`](CustomEvent.md#metadata)

***

### name

```ts
name: "sandbox.starting";
```

Defined in: [packages/ai/src/types.ts:1883](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1883)

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

Defined in: [packages/ai/src/types.ts:1813](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1813)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1884](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1884)

The payload. Any JSON value, and required.

#### provider

```ts
provider: string;
```

#### Overrides

```ts
CustomEvent.value
```
