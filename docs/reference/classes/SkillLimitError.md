---
id: SkillLimitError
title: SkillLimitError
---

Defined in: packages/ai/src/utilities/errors.ts:22

## Extends

- `Error`

## Constructors

### Constructor

```ts
new SkillLimitError(init): SkillLimitError;
```

Defined in: packages/ai/src/utilities/errors.ts:30

#### Parameters

##### init

[`SkillLimitErrorInit`](../interfaces/SkillLimitErrorInit.md)

#### Returns

`SkillLimitError`

#### Overrides

```ts
Error.constructor
```

## Properties

### actual

```ts
readonly actual: number;
```

Defined in: packages/ai/src/utilities/errors.ts:27

***

### allowed

```ts
readonly allowed: number;
```

Defined in: packages/ai/src/utilities/errors.ts:26

***

### limit

```ts
readonly limit: string;
```

Defined in: packages/ai/src/utilities/errors.ts:25

***

### offending

```ts
readonly offending: string[];
```

Defined in: packages/ai/src/utilities/errors.ts:28

***

### path

```ts
readonly path: "native" | "portable";
```

Defined in: packages/ai/src/utilities/errors.ts:24

***

### provider

```ts
readonly provider: "anthropic" | "openai" | "gemini" | "other";
```

Defined in: packages/ai/src/utilities/errors.ts:23
