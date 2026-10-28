---
id: JSONSchema
title: JSONSchema
---

Defined in: packages/ai/src/types.ts:114

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

Defined in: packages/ai/src/types.ts:124

***

### $ref?

```ts
optional $ref?: string;
```

Defined in: packages/ai/src/types.ts:123

***

### additionalItems?

```ts
optional additionalItems?: boolean | JSONSchema;
```

Defined in: packages/ai/src/types.ts:145

***

### additionalProperties?

```ts
optional additionalProperties?: boolean | JSONSchema;
```

Defined in: packages/ai/src/types.ts:144

***

### allOf?

```ts
optional allOf?: JSONSchema[];
```

Defined in: packages/ai/src/types.ts:126

***

### anyOf?

```ts
optional anyOf?: JSONSchema[];
```

Defined in: packages/ai/src/types.ts:127

***

### const?

```ts
optional const?: unknown;
```

Defined in: packages/ai/src/types.ts:120

***

### default?

```ts
optional default?: unknown;
```

Defined in: packages/ai/src/types.ts:122

***

### definitions?

```ts
optional definitions?: Record<string, JSONSchema>;
```

Defined in: packages/ai/src/types.ts:125

***

### description?

```ts
optional description?: string;
```

Defined in: packages/ai/src/types.ts:121

***

### else?

```ts
optional else?: JSONSchema;
```

Defined in: packages/ai/src/types.ts:132

***

### enum?

```ts
optional enum?: unknown[];
```

Defined in: packages/ai/src/types.ts:119

***

### examples?

```ts
optional examples?: unknown[];
```

Defined in: packages/ai/src/types.ts:151

***

### exclusiveMaximum?

```ts
optional exclusiveMaximum?: number;
```

Defined in: packages/ai/src/types.ts:136

***

### exclusiveMinimum?

```ts
optional exclusiveMinimum?: number;
```

Defined in: packages/ai/src/types.ts:135

***

### format?

```ts
optional format?: string;
```

Defined in: packages/ai/src/types.ts:140

***

### if?

```ts
optional if?: JSONSchema;
```

Defined in: packages/ai/src/types.ts:130

***

### items?

```ts
optional items?: JSONSchema | JSONSchema[];
```

Defined in: packages/ai/src/types.ts:117

***

### maximum?

```ts
optional maximum?: number;
```

Defined in: packages/ai/src/types.ts:134

***

### maxItems?

```ts
optional maxItems?: number;
```

Defined in: packages/ai/src/types.ts:142

***

### maxLength?

```ts
optional maxLength?: number;
```

Defined in: packages/ai/src/types.ts:138

***

### maxProperties?

```ts
optional maxProperties?: number;
```

Defined in: packages/ai/src/types.ts:149

***

### minimum?

```ts
optional minimum?: number;
```

Defined in: packages/ai/src/types.ts:133

***

### minItems?

```ts
optional minItems?: number;
```

Defined in: packages/ai/src/types.ts:141

***

### minLength?

```ts
optional minLength?: number;
```

Defined in: packages/ai/src/types.ts:137

***

### minProperties?

```ts
optional minProperties?: number;
```

Defined in: packages/ai/src/types.ts:148

***

### not?

```ts
optional not?: JSONSchema;
```

Defined in: packages/ai/src/types.ts:129

***

### oneOf?

```ts
optional oneOf?: JSONSchema[];
```

Defined in: packages/ai/src/types.ts:128

***

### pattern?

```ts
optional pattern?: string;
```

Defined in: packages/ai/src/types.ts:139

***

### patternProperties?

```ts
optional patternProperties?: Record<string, JSONSchema>;
```

Defined in: packages/ai/src/types.ts:146

***

### properties?

```ts
optional properties?: Record<string, JSONSchema>;
```

Defined in: packages/ai/src/types.ts:116

***

### propertyNames?

```ts
optional propertyNames?: JSONSchema;
```

Defined in: packages/ai/src/types.ts:147

***

### required?

```ts
optional required?: string[];
```

Defined in: packages/ai/src/types.ts:118

***

### then?

```ts
optional then?: JSONSchema;
```

Defined in: packages/ai/src/types.ts:131

***

### title?

```ts
optional title?: string;
```

Defined in: packages/ai/src/types.ts:150

***

### type?

```ts
optional type?: string | string[];
```

Defined in: packages/ai/src/types.ts:115

***

### uniqueItems?

```ts
optional uniqueItems?: boolean;
```

Defined in: packages/ai/src/types.ts:143
