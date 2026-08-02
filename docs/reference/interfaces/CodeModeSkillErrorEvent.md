---
id: CodeModeSkillErrorEvent
title: CodeModeSkillErrorEvent
---

# Interface: CodeModeSkillErrorEvent

Defined in: [packages/ai/src/types.ts:1482](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1482)

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

Defined in: [packages/ai/src/types.ts:1339](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1339)

Model identifier for multi-model support

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`model`](CustomEvent.md#model)

***

### name

```ts
name: "code_mode:skill_error";
```

Defined in: [packages/ai/src/types.ts:1483](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1483)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1484](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1484)

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
