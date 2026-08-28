---
id: SkillLimitError
title: SkillLimitError
---

# Class: SkillLimitError

Defined in: [packages/ai/src/utilities/errors.ts:22](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/errors.ts#L22)

## Extends

- `Error`

## Constructors

### Constructor

```ts
new SkillLimitError(init): SkillLimitError;
```

Defined in: [packages/ai/src/utilities/errors.ts:30](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/errors.ts#L30)

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

Defined in: [packages/ai/src/utilities/errors.ts:27](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/errors.ts#L27)

***

### allowed

```ts
readonly allowed: number;
```

Defined in: [packages/ai/src/utilities/errors.ts:26](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/errors.ts#L26)

***

### limit

```ts
readonly limit: string;
```

Defined in: [packages/ai/src/utilities/errors.ts:25](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/errors.ts#L25)

***

### offending

```ts
readonly offending: string[];
```

Defined in: [packages/ai/src/utilities/errors.ts:28](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/errors.ts#L28)

***

### path

```ts
readonly path: "native" | "portable";
```

Defined in: [packages/ai/src/utilities/errors.ts:24](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/errors.ts#L24)

***

### provider

```ts
readonly provider: "anthropic" | "openai" | "gemini" | "other";
```

Defined in: [packages/ai/src/utilities/errors.ts:23](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/errors.ts#L23)
