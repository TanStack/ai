---
id: JSONSchema
title: JSONSchema
---

Defined in: [packages/ai/src/types.ts:117](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L117)

JSON Schema type for defining tool input/output schemas as raw JSON Schema objects.
This allows tools to be defined without schema libraries when you have JSON Schema definitions available.

## Indexable

```ts
[key: string]: any
```

## Properties

### $defs?

```ts
optional $defs?: Record<string, JSONSchema>;
```

Defined in: [packages/ai/src/types.ts:127](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L127)

***

### $ref?

```ts
optional $ref?: string;
```

Defined in: [packages/ai/src/types.ts:126](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L126)

***

### additionalItems?

```ts
optional additionalItems?: boolean | JSONSchema;
```

Defined in: [packages/ai/src/types.ts:148](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L148)

***

### additionalProperties?

```ts
optional additionalProperties?: boolean | JSONSchema;
```

Defined in: [packages/ai/src/types.ts:147](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L147)

***

### allOf?

```ts
optional allOf?: JSONSchema[];
```

Defined in: [packages/ai/src/types.ts:129](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L129)

***

### anyOf?

```ts
optional anyOf?: JSONSchema[];
```

Defined in: [packages/ai/src/types.ts:130](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L130)

***

### const?

```ts
optional const?: unknown;
```

Defined in: [packages/ai/src/types.ts:123](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L123)

***

### default?

```ts
optional default?: unknown;
```

Defined in: [packages/ai/src/types.ts:125](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L125)

***

### definitions?

```ts
optional definitions?: Record<string, JSONSchema>;
```

Defined in: [packages/ai/src/types.ts:128](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L128)

***

### description?

```ts
optional description?: string;
```

Defined in: [packages/ai/src/types.ts:124](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L124)

***

### else?

```ts
optional else?: JSONSchema;
```

Defined in: [packages/ai/src/types.ts:135](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L135)

***

### enum?

```ts
optional enum?: unknown[];
```

Defined in: [packages/ai/src/types.ts:122](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L122)

***

### examples?

```ts
optional examples?: unknown[];
```

Defined in: [packages/ai/src/types.ts:154](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L154)

***

### exclusiveMaximum?

```ts
optional exclusiveMaximum?: number;
```

Defined in: [packages/ai/src/types.ts:139](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L139)

***

### exclusiveMinimum?

```ts
optional exclusiveMinimum?: number;
```

Defined in: [packages/ai/src/types.ts:138](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L138)

***

### format?

```ts
optional format?: string;
```

Defined in: [packages/ai/src/types.ts:143](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L143)

***

### if?

```ts
optional if?: JSONSchema;
```

Defined in: [packages/ai/src/types.ts:133](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L133)

***

### items?

```ts
optional items?: JSONSchema | JSONSchema[];
```

Defined in: [packages/ai/src/types.ts:120](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L120)

***

### maximum?

```ts
optional maximum?: number;
```

Defined in: [packages/ai/src/types.ts:137](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L137)

***

### maxItems?

```ts
optional maxItems?: number;
```

Defined in: [packages/ai/src/types.ts:145](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L145)

***

### maxLength?

```ts
optional maxLength?: number;
```

Defined in: [packages/ai/src/types.ts:141](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L141)

***

### maxProperties?

```ts
optional maxProperties?: number;
```

Defined in: [packages/ai/src/types.ts:152](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L152)

***

### minimum?

```ts
optional minimum?: number;
```

Defined in: [packages/ai/src/types.ts:136](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L136)

***

### minItems?

```ts
optional minItems?: number;
```

Defined in: [packages/ai/src/types.ts:144](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L144)

***

### minLength?

```ts
optional minLength?: number;
```

Defined in: [packages/ai/src/types.ts:140](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L140)

***

### minProperties?

```ts
optional minProperties?: number;
```

Defined in: [packages/ai/src/types.ts:151](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L151)

***

### not?

```ts
optional not?: JSONSchema;
```

Defined in: [packages/ai/src/types.ts:132](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L132)

***

### oneOf?

```ts
optional oneOf?: JSONSchema[];
```

Defined in: [packages/ai/src/types.ts:131](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L131)

***

### pattern?

```ts
optional pattern?: string;
```

Defined in: [packages/ai/src/types.ts:142](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L142)

***

### patternProperties?

```ts
optional patternProperties?: Record<string, JSONSchema>;
```

Defined in: [packages/ai/src/types.ts:149](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L149)

***

### properties?

```ts
optional properties?: Record<string, JSONSchema>;
```

Defined in: [packages/ai/src/types.ts:119](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L119)

***

### propertyNames?

```ts
optional propertyNames?: JSONSchema;
```

Defined in: [packages/ai/src/types.ts:150](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L150)

***

### required?

```ts
optional required?: string[];
```

Defined in: [packages/ai/src/types.ts:121](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L121)

***

### then?

```ts
optional then?: JSONSchema;
```

Defined in: [packages/ai/src/types.ts:134](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L134)

***

### title?

```ts
optional title?: string;
```

Defined in: [packages/ai/src/types.ts:153](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L153)

***

### type?

```ts
optional type?: string | string[];
```

Defined in: [packages/ai/src/types.ts:118](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L118)

***

### uniqueItems?

```ts
optional uniqueItems?: boolean;
```

Defined in: [packages/ai/src/types.ts:146](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L146)
