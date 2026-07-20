---
id: SkillRegisteredEvent
title: SkillRegisteredEvent
---

# Interface: SkillRegisteredEvent

Defined in: [packages/ai/src/types.ts:1454](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1454)

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

Defined in: [packages/ai/src/types.ts:1307](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1307)

Model identifier for multi-model support

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`model`](CustomEvent.md#model)

***

### name

```ts
name: "skill:registered";
```

Defined in: [packages/ai/src/types.ts:1455](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1455)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1456](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1456)

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
