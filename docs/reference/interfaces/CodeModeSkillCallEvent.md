---
id: CodeModeSkillCallEvent
title: CodeModeSkillCallEvent
---

# Interface: CodeModeSkillCallEvent

Defined in: [packages/ai/src/types.ts:1442](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1442)

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
name: "code_mode:skill_call";
```

Defined in: [packages/ai/src/types.ts:1443](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1443)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1444](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1444)

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
