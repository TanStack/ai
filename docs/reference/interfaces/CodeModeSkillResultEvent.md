---
id: CodeModeSkillResultEvent
title: CodeModeSkillResultEvent
---

# Interface: CodeModeSkillResultEvent

Defined in: [packages/ai/src/types.ts:1478](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1478)

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
name: "code_mode:skill_result";
```

Defined in: [packages/ai/src/types.ts:1479](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1479)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1480](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1480)

#### duration

```ts
duration: number;
```

#### result

```ts
result: unknown;
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
