---
id: StandardSchemaValidationError
title: StandardSchemaValidationError
---

Defined in: [packages/ai/src/activities/chat/tools/schema-converter.ts:443](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/schema-converter.ts#L443)

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

Defined in: [packages/ai/src/activities/chat/tools/schema-converter.ts:447](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/schema-converter.ts#L447)

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

Defined in: [packages/ai/src/activities/chat/tools/schema-converter.ts:445](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/schema-converter.ts#L445)

***

### name

```ts
readonly name: "StandardSchemaValidationError" = 'StandardSchemaValidationError';
```

Defined in: [packages/ai/src/activities/chat/tools/schema-converter.ts:444](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/schema-converter.ts#L444)

#### Overrides

```ts
Error.name
```
