---
id: StandardSchemaValidationError
title: StandardSchemaValidationError
---

# Class: StandardSchemaValidationError

Defined in: [packages/ai/src/activities/chat/tools/schema-converter.ts:365](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/schema-converter.ts#L365)

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

Defined in: [packages/ai/src/activities/chat/tools/schema-converter.ts:369](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/schema-converter.ts#L369)

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

Defined in: [packages/ai/src/activities/chat/tools/schema-converter.ts:367](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/schema-converter.ts#L367)

***

### name

```ts
readonly name: "StandardSchemaValidationError" = 'StandardSchemaValidationError';
```

Defined in: [packages/ai/src/activities/chat/tools/schema-converter.ts:366](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/schema-converter.ts#L366)

#### Overrides

```ts
Error.name
```
