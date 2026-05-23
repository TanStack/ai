---
id: StandardSchemaValidationError
title: StandardSchemaValidationError
---

# Class: StandardSchemaValidationError

Defined in: [packages/typescript/ai/src/activities/chat/tools/schema-converter.ts:347](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/schema-converter.ts#L347)

Error thrown when Standard Schema validation fails. Carries the original
`issues` array so consumers (middleware `onError`, callers catching from
`chat({ outputSchema })`) can programmatically inspect each failure.

## Extends

- `Error`

## Constructors

### Constructor

```ts
new StandardSchemaValidationError(issues): StandardSchemaValidationError;
```

Defined in: [packages/typescript/ai/src/activities/chat/tools/schema-converter.ts:351](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/schema-converter.ts#L351)

#### Parameters

##### issues

readonly `Issue`[]

#### Returns

`StandardSchemaValidationError`

#### Overrides

```ts
Error.constructor
```

## Properties

### issues

```ts
readonly issues: readonly Issue[];
```

Defined in: [packages/typescript/ai/src/activities/chat/tools/schema-converter.ts:349](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/schema-converter.ts#L349)

***

### name

```ts
readonly name: "StandardSchemaValidationError" = 'StandardSchemaValidationError';
```

Defined in: [packages/typescript/ai/src/activities/chat/tools/schema-converter.ts:348](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/tools/schema-converter.ts#L348)

#### Overrides

```ts
Error.name
```
