---
id: StandardSchemaValidationError
title: StandardSchemaValidationError
---

# Class: StandardSchemaValidationError

Defined in: [packages/ai/src/activities/chat/tools/schema-converter.ts:418](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/schema-converter.ts#L418)

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

Defined in: [packages/ai/src/activities/chat/tools/schema-converter.ts:422](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/schema-converter.ts#L422)

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

Defined in: [packages/ai/src/activities/chat/tools/schema-converter.ts:420](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/schema-converter.ts#L420)

***

### name

```ts
readonly name: "StandardSchemaValidationError" = 'StandardSchemaValidationError';
```

Defined in: [packages/ai/src/activities/chat/tools/schema-converter.ts:419](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/schema-converter.ts#L419)

#### Overrides

```ts
Error.name
```
