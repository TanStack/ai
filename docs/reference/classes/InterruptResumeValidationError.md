---
id: InterruptResumeValidationError
title: InterruptResumeValidationError
---

# Class: InterruptResumeValidationError

Defined in: [packages/ai/src/interrupt-resume.ts:69](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L69)

## Extends

- `Error`

## Constructors

### Constructor

```ts
new InterruptResumeValidationError(errors): InterruptResumeValidationError;
```

Defined in: [packages/ai/src/interrupt-resume.ts:72](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L72)

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

Defined in: [packages/ai/src/interrupt-resume.ts:72](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L72)

***

### name

```ts
readonly name: "InterruptResumeValidationError" = 'InterruptResumeValidationError';
```

Defined in: [packages/ai/src/interrupt-resume.ts:70](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L70)

#### Overrides

```ts
Error.name
```
