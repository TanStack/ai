---
id: StandardSchemaValidationError
title: StandardSchemaValidationError
---

# Class: StandardSchemaValidationError

Defined in: [packages/ai/src/activities/chat/tools/schema-converter.ts:431](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/schema-converter.ts#L431)

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

Defined in: [packages/ai/src/activities/chat/tools/schema-converter.ts:435](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/schema-converter.ts#L435)

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

Defined in: [packages/ai/src/activities/chat/tools/schema-converter.ts:433](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/schema-converter.ts#L433)

***

### name

```ts
readonly name: "StandardSchemaValidationError" = 'StandardSchemaValidationError';
```

Defined in: [packages/ai/src/activities/chat/tools/schema-converter.ts:432](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/schema-converter.ts#L432)

#### Overrides

```ts
Error.name
```
