---
id: SkillRegisteredEvent
title: SkillRegisteredEvent
---

# Interface: SkillRegisteredEvent

Defined in: [packages/ai/src/types.ts:1461](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1461)

Custom event for extensibility.

@ag-ui/core provides: `name`, `value`
TanStack AI adds: `model?`

## Extends

- [`CustomEvent`](CustomEvent.md)

## Indexable

```ts
[k: string]: unknown
```

## Properties

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1314](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1314)

Model identifier for multi-model support

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`model`](CustomEvent.md#model)

***

### name

```ts
name: "skill:registered";
```

Defined in: [packages/ai/src/types.ts:1462](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1462)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1463](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1463)

#### description

```ts
description: string;
```

#### id

```ts
id: string;
```

#### name

```ts
name: string;
```

#### timestamp

```ts
timestamp: number;
```

#### Overrides

```ts
CustomEvent.value
```
