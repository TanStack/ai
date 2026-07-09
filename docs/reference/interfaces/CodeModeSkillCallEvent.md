---
id: CodeModeSkillCallEvent
title: CodeModeSkillCallEvent
---

# Interface: CodeModeSkillCallEvent

Defined in: [packages/ai/src/types.ts:1433](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1433)

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
name: "code_mode:skill_call";
```

Defined in: [packages/ai/src/types.ts:1434](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1434)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1435](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1435)

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
