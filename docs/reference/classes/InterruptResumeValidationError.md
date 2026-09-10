---
id: InterruptResumeValidationError
title: InterruptResumeValidationError
---

# Class: InterruptResumeValidationError

Defined in: [packages/ai/src/interrupt-resume.ts:77](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L77)

## Extends

- `Error`

## Constructors

### Constructor

```ts
new InterruptResumeValidationError(errors): InterruptResumeValidationError;
```

Defined in: [packages/ai/src/interrupt-resume.ts:80](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L80)

#### Parameters

##### errors

readonly [`InterruptSubmissionError`](../type-aliases/InterruptSubmissionError.md)[]

#### Returns

`InterruptResumeValidationError`

#### Overrides

```ts
Error.constructor
```

## Properties

### errors

```ts
readonly errors: readonly InterruptSubmissionError[];
```

Defined in: [packages/ai/src/interrupt-resume.ts:80](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L80)

***

### name

```ts
readonly name: "InterruptResumeValidationError" = 'InterruptResumeValidationError';
```

Defined in: [packages/ai/src/interrupt-resume.ts:78](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L78)

#### Overrides

```ts
Error.name
```
