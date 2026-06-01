---
id: JSONSchema
title: JSONSchema
---

# Interface: JSONSchema

Defined in: [packages/ai/src/types.ts:59](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L59)

JSON Schema type for defining tool input/output schemas as raw JSON Schema objects.
This allows tools to be defined without schema libraries when you have JSON Schema definitions available.

## Indexable

```ts
[key: string]: any
```

## Properties

### $defs?

```ts
optional $defs: Record<string, JSONSchema>;
```

Defined in: [packages/ai/src/types.ts:69](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L69)

***

### $ref?

```ts
optional $ref: string;
```

Defined in: [packages/ai/src/types.ts:68](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L68)

***

### additionalItems?

```ts
optional additionalItems: boolean | JSONSchema;
```

Defined in: [packages/ai/src/types.ts:90](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L90)

***

### additionalProperties?

```ts
optional additionalProperties: boolean | JSONSchema;
```

Defined in: [packages/ai/src/types.ts:89](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L89)

***

### allOf?

```ts
optional allOf: JSONSchema[];
```

Defined in: [packages/ai/src/types.ts:71](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L71)

***

### anyOf?

```ts
optional anyOf: JSONSchema[];
```

Defined in: [packages/ai/src/types.ts:72](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L72)

***

### const?

```ts
optional const: unknown;
```

Defined in: [packages/ai/src/types.ts:65](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L65)

***

### default?

```ts
optional default: unknown;
```

Defined in: [packages/ai/src/types.ts:67](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L67)

***

### definitions?

```ts
optional definitions: Record<string, JSONSchema>;
```

Defined in: [packages/ai/src/types.ts:70](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L70)

***

### description?

```ts
optional description: string;
```

Defined in: [packages/ai/src/types.ts:66](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L66)

***

### else?

```ts
optional else: JSONSchema;
```

Defined in: [packages/ai/src/types.ts:77](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L77)

***

### enum?

```ts
optional enum: unknown[];
```

Defined in: [packages/ai/src/types.ts:64](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L64)

***

### examples?

```ts
optional examples: unknown[];
```

Defined in: [packages/ai/src/types.ts:96](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L96)

***

### exclusiveMaximum?

```ts
optional exclusiveMaximum: number;
```

Defined in: [packages/ai/src/types.ts:81](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L81)

***

### exclusiveMinimum?

```ts
optional exclusiveMinimum: number;
```

Defined in: [packages/ai/src/types.ts:80](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L80)

***

### format?

```ts
optional format: string;
```

Defined in: [packages/ai/src/types.ts:85](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L85)

***

### if?

```ts
optional if: JSONSchema;
```

Defined in: [packages/ai/src/types.ts:75](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L75)

***

### items?

```ts
optional items: JSONSchema | JSONSchema[];
```

Defined in: [packages/ai/src/types.ts:62](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L62)

***

### maximum?

```ts
optional maximum: number;
```

Defined in: [packages/ai/src/types.ts:79](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L79)

***

### maxItems?

```ts
optional maxItems: number;
```

Defined in: [packages/ai/src/types.ts:87](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L87)

***

### maxLength?

```ts
optional maxLength: number;
```

Defined in: [packages/ai/src/types.ts:83](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L83)

***

### maxProperties?

```ts
optional maxProperties: number;
```

Defined in: [packages/ai/src/types.ts:94](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L94)

***

### minimum?

```ts
optional minimum: number;
```

Defined in: [packages/ai/src/types.ts:78](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L78)

***

### minItems?

```ts
optional minItems: number;
```

Defined in: [packages/ai/src/types.ts:86](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L86)

***

### minLength?

```ts
optional minLength: number;
```

Defined in: [packages/ai/src/types.ts:82](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L82)

***

### minProperties?

```ts
optional minProperties: number;
```

Defined in: [packages/ai/src/types.ts:93](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L93)

***

### not?

```ts
optional not: JSONSchema;
```

Defined in: [packages/ai/src/types.ts:74](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L74)

***

### oneOf?

```ts
optional oneOf: JSONSchema[];
```

Defined in: [packages/ai/src/types.ts:73](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L73)

***

### pattern?

```ts
optional pattern: string;
```

Defined in: [packages/ai/src/types.ts:84](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L84)

***

### patternProperties?

```ts
optional patternProperties: Record<string, JSONSchema>;
```

Defined in: [packages/ai/src/types.ts:91](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L91)

***

### properties?

```ts
optional properties: Record<string, JSONSchema>;
```

Defined in: [packages/ai/src/types.ts:61](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L61)

***

### propertyNames?

```ts
optional propertyNames: JSONSchema;
```

Defined in: [packages/ai/src/types.ts:92](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L92)

***

### required?

```ts
optional required: string[];
```

Defined in: [packages/ai/src/types.ts:63](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L63)

***

### then?

```ts
optional then: JSONSchema;
```

Defined in: [packages/ai/src/types.ts:76](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L76)

***

### title?

```ts
optional title: string;
```

Defined in: [packages/ai/src/types.ts:95](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L95)

***

### type?

```ts
optional type: string | string[];
```

Defined in: [packages/ai/src/types.ts:60](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L60)

***

### uniqueItems?

```ts
optional uniqueItems: boolean;
```

Defined in: [packages/ai/src/types.ts:88](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L88)
