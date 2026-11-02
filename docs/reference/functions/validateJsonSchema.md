---
id: validateJsonSchema
title: validateJsonSchema
---

```ts
function validateJsonSchema(schema, value): Result<unknown>;
```

Defined in: [packages/ai/src/activities/chat/tools/input-validation.ts:427](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/input-validation.ts#L427)

Check `value` against the JSON Schema `schema` with `@cfworker/json-schema`,
as a tool input is checked, with no repair. Every keyword that the
validator knows is checked. `format` is an annotation only. The result has
the Standard Schema shape: `{ value }` when it fits, else `{ issues }`.

## Parameters

### schema

`boolean` \| `AnySchema`

### value

`unknown`

## Returns

`Result`\<`unknown`\>

## Example

```ts
const result = validateJsonSchema({ type: 'string', pattern: '^a' }, 'b')
if (result.issues) console.log(result.issues.map((issue) => issue.message))
```
