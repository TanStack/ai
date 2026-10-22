---
id: InterruptResumeValidationError
title: InterruptResumeValidationError
---

Defined in: packages/ai/src/interrupt-resume.ts:78

## Extends

- `Error`

## Constructors

### Constructor

```ts
new InterruptResumeValidationError(errors): InterruptResumeValidationError;
```

Defined in: packages/ai/src/interrupt-resume.ts:81

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

Defined in: packages/ai/src/interrupt-resume.ts:81

***

### name

```ts
readonly name: "InterruptResumeValidationError" = 'InterruptResumeValidationError';
```

Defined in: packages/ai/src/interrupt-resume.ts:79

#### Overrides

```ts
Error.name
```
