---
id: CodeModeSkillResultEvent
title: CodeModeSkillResultEvent
---

# Interface: CodeModeSkillResultEvent

Defined in: [packages/ai/src/types.ts:1446](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1446)

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
name: "code_mode:skill_result";
```

Defined in: [packages/ai/src/types.ts:1447](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1447)

#### Overrides

```ts
CustomEvent.name
```

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1448](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1448)

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
