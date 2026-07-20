---
id: CodeModeSkillErrorEvent
title: CodeModeSkillErrorEvent
---

# Interface: CodeModeSkillErrorEvent

Defined in: [packages/ai/src/types.ts:1450](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1450)

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
name: "code_mode:skill_error";
```

Defined in: [packages/ai/src/types.ts:1451](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1451)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1452](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1452)

#### duration

```ts
duration: number;
```

#### error

```ts
error: string;
```

#### skill

```ts
skill: string;
```

#### timestamp

```ts
timestamp: number;
```

#### Overrides

```ts
CustomEvent.value
```
