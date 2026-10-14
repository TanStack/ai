---
id: JSONSchema
title: JSONSchema
---

Defined in: [packages/ai/src/types.ts:114](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L114)

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

Defined in: [packages/ai/src/types.ts:124](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L124)

***

### $ref?

```ts
optional $ref?: string;
```

Defined in: [packages/ai/src/types.ts:123](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L123)

***

### additionalItems?

```ts
optional additionalItems?: boolean | JSONSchema;
```

Defined in: [packages/ai/src/types.ts:145](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L145)

***

### additionalProperties?

```ts
optional additionalProperties?: boolean | JSONSchema;
```

Defined in: [packages/ai/src/types.ts:144](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L144)

***

### allOf?

```ts
optional allOf?: JSONSchema[];
```

Defined in: [packages/ai/src/types.ts:126](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L126)

***

### anyOf?

```ts
optional anyOf?: JSONSchema[];
```

Defined in: [packages/ai/src/types.ts:127](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L127)

***

### const?

```ts
optional const?: unknown;
```

Defined in: [packages/ai/src/types.ts:120](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L120)

***

### default?

```ts
optional default?: unknown;
```

Defined in: [packages/ai/src/types.ts:122](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L122)

***

### definitions?

```ts
optional definitions?: Record<string, JSONSchema>;
```

Defined in: [packages/ai/src/types.ts:125](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L125)

***

### description?

```ts
optional description?: string;
```

Defined in: [packages/ai/src/types.ts:121](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L121)

***

### else?

```ts
optional else?: JSONSchema;
```

Defined in: [packages/ai/src/types.ts:132](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L132)

***

### enum?

```ts
optional enum?: unknown[];
```

Defined in: [packages/ai/src/types.ts:119](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L119)

***

### examples?

```ts
optional examples?: unknown[];
```

Defined in: [packages/ai/src/types.ts:151](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L151)

***

### exclusiveMaximum?

```ts
optional exclusiveMaximum?: number;
```

Defined in: [packages/ai/src/types.ts:136](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L136)

***

### exclusiveMinimum?

```ts
optional exclusiveMinimum?: number;
```

Defined in: [packages/ai/src/types.ts:135](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L135)

***

### format?

```ts
optional format?: string;
```

Defined in: [packages/ai/src/types.ts:140](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L140)

***

### if?

```ts
optional if?: JSONSchema;
```

Defined in: [packages/ai/src/types.ts:130](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L130)

***

### items?

```ts
optional items?: JSONSchema | JSONSchema[];
```

Defined in: [packages/ai/src/types.ts:117](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L117)

***

### maximum?

```ts
optional maximum?: number;
```

Defined in: [packages/ai/src/types.ts:134](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L134)

***

### maxItems?

```ts
optional maxItems?: number;
```

Defined in: [packages/ai/src/types.ts:142](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L142)

***

### maxLength?

```ts
optional maxLength?: number;
```

Defined in: [packages/ai/src/types.ts:138](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L138)

***

### maxProperties?

```ts
optional maxProperties?: number;
```

Defined in: [packages/ai/src/types.ts:149](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L149)

***

### minimum?

```ts
optional minimum?: number;
```

Defined in: [packages/ai/src/types.ts:133](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L133)

***

### minItems?

```ts
optional minItems?: number;
```

Defined in: [packages/ai/src/types.ts:141](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L141)

***

### minLength?

```ts
optional minLength?: number;
```

Defined in: [packages/ai/src/types.ts:137](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L137)

***

### minProperties?

```ts
optional minProperties?: number;
```

Defined in: [packages/ai/src/types.ts:148](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L148)

***

### not?

```ts
optional not?: JSONSchema;
```

Defined in: [packages/ai/src/types.ts:129](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L129)

***

### oneOf?

```ts
optional oneOf?: JSONSchema[];
```

Defined in: [packages/ai/src/types.ts:128](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L128)

***

### pattern?

```ts
optional pattern?: string;
```

Defined in: [packages/ai/src/types.ts:139](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L139)

***

### patternProperties?

```ts
optional patternProperties?: Record<string, JSONSchema>;
```

Defined in: [packages/ai/src/types.ts:146](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L146)

***

### properties?

```ts
optional properties?: Record<string, JSONSchema>;
```

Defined in: [packages/ai/src/types.ts:116](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L116)

***

### propertyNames?

```ts
optional propertyNames?: JSONSchema;
```

Defined in: [packages/ai/src/types.ts:147](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L147)

***

### required?

```ts
optional required?: string[];
```

Defined in: [packages/ai/src/types.ts:118](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L118)

***

### then?

```ts
optional then?: JSONSchema;
```

Defined in: [packages/ai/src/types.ts:131](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L131)

***

### title?

```ts
optional title?: string;
```

Defined in: [packages/ai/src/types.ts:150](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L150)

***

### type?

```ts
optional type?: string | string[];
```

Defined in: [packages/ai/src/types.ts:115](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L115)

***

### uniqueItems?

```ts
optional uniqueItems?: boolean;
```

Defined in: [packages/ai/src/types.ts:143](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L143)
