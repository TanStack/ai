---
id: CodeModeSkillCallEvent
title: CodeModeSkillCallEvent
---

# Interface: CodeModeSkillCallEvent

Defined in: [packages/ai/src/types.ts:1474](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1474)

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
name: "code_mode:skill_call";
```

Defined in: [packages/ai/src/types.ts:1475](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1475)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1476](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1476)

#### input

```ts
input: unknown;
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
