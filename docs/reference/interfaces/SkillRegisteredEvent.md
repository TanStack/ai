---
id: SkillRegisteredEvent
title: SkillRegisteredEvent
---

# Interface: SkillRegisteredEvent

Defined in: [packages/ai/src/types.ts:1445](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1445)

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

Defined in: [packages/ai/src/types.ts:1298](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1298)

Model identifier for multi-model support

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`model`](CustomEvent.md#model)

***

### name

```ts
name: "skill:registered";
```

Defined in: [packages/ai/src/types.ts:1446](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1446)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1447](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1447)

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
