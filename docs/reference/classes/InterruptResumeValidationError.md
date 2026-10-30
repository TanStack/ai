---
id: InterruptResumeValidationError
title: InterruptResumeValidationError
---

Defined in: [packages/ai/src/interrupt-resume.ts:78](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L78)

## Extends

- `Error`

## Constructors

### Constructor

```ts
new InterruptResumeValidationError(errors): InterruptResumeValidationError;
```

Defined in: [packages/ai/src/interrupt-resume.ts:81](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L81)

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

Defined in: [packages/ai/src/interrupt-resume.ts:81](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L81)

***

### name

```ts
readonly name: "InterruptResumeValidationError" = 'InterruptResumeValidationError';
```

Defined in: [packages/ai/src/interrupt-resume.ts:79](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L79)

#### Overrides

```ts
Error.name
```
