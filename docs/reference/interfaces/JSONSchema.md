---
id: JSONSchema
title: JSONSchema
---

# Interface: JSONSchema

Defined in: [packages/ai/src/types.ts:84](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L84)

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

Defined in: [packages/ai/src/types.ts:94](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L94)

***

### $ref?

```ts
optional $ref?: string;
```

Defined in: [packages/ai/src/types.ts:93](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L93)

***

### additionalItems?

```ts
optional additionalItems?: boolean | JSONSchema;
```

Defined in: [packages/ai/src/types.ts:115](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L115)

***

### additionalProperties?

```ts
optional additionalProperties?: boolean | JSONSchema;
```

Defined in: [packages/ai/src/types.ts:114](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L114)

***

### allOf?

```ts
optional allOf?: JSONSchema[];
```

Defined in: [packages/ai/src/types.ts:96](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L96)

***

### anyOf?

```ts
optional anyOf?: JSONSchema[];
```

Defined in: [packages/ai/src/types.ts:97](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L97)

***

### const?

```ts
optional const?: unknown;
```

Defined in: [packages/ai/src/types.ts:90](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L90)

***

### default?

```ts
optional default?: unknown;
```

Defined in: [packages/ai/src/types.ts:92](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L92)

***

### definitions?

```ts
optional definitions?: Record<string, JSONSchema>;
```

Defined in: [packages/ai/src/types.ts:95](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L95)

***

### description?

```ts
optional description?: string;
```

Defined in: [packages/ai/src/types.ts:91](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L91)

***

### else?

```ts
optional else?: JSONSchema;
```

Defined in: [packages/ai/src/types.ts:102](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L102)

***

### enum?

```ts
optional enum?: unknown[];
```

Defined in: [packages/ai/src/types.ts:89](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L89)

***

### examples?

```ts
optional examples?: unknown[];
```

Defined in: [packages/ai/src/types.ts:121](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L121)

***

### exclusiveMaximum?

```ts
optional exclusiveMaximum?: number;
```

Defined in: [packages/ai/src/types.ts:106](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L106)

***

### exclusiveMinimum?

```ts
optional exclusiveMinimum?: number;
```

Defined in: [packages/ai/src/types.ts:105](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L105)

***

### format?

```ts
optional format?: string;
```

Defined in: [packages/ai/src/types.ts:110](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L110)

***

### if?

```ts
optional if?: JSONSchema;
```

Defined in: [packages/ai/src/types.ts:100](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L100)

***

### items?

```ts
optional items?: JSONSchema | JSONSchema[];
```

Defined in: [packages/ai/src/types.ts:87](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L87)

***

### maximum?

```ts
optional maximum?: number;
```

Defined in: [packages/ai/src/types.ts:104](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L104)

***

### maxItems?

```ts
optional maxItems?: number;
```

Defined in: [packages/ai/src/types.ts:112](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L112)

***

### maxLength?

```ts
optional maxLength?: number;
```

Defined in: [packages/ai/src/types.ts:108](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L108)

***

### maxProperties?

```ts
optional maxProperties?: number;
```

Defined in: [packages/ai/src/types.ts:119](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L119)

***

### minimum?

```ts
optional minimum?: number;
```

Defined in: [packages/ai/src/types.ts:103](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L103)

***

### minItems?

```ts
optional minItems?: number;
```

Defined in: [packages/ai/src/types.ts:111](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L111)

***

### minLength?

```ts
optional minLength?: number;
```

Defined in: [packages/ai/src/types.ts:107](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L107)

***

### minProperties?

```ts
optional minProperties?: number;
```

Defined in: [packages/ai/src/types.ts:118](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L118)

***

### not?

```ts
optional not?: JSONSchema;
```

Defined in: [packages/ai/src/types.ts:99](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L99)

***

### oneOf?

```ts
optional oneOf?: JSONSchema[];
```

Defined in: [packages/ai/src/types.ts:98](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L98)

***

### pattern?

```ts
optional pattern?: string;
```

Defined in: [packages/ai/src/types.ts:109](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L109)

***

### patternProperties?

```ts
optional patternProperties?: Record<string, JSONSchema>;
```

Defined in: [packages/ai/src/types.ts:116](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L116)

***

### properties?

```ts
optional properties?: Record<string, JSONSchema>;
```

Defined in: [packages/ai/src/types.ts:86](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L86)

***

### propertyNames?

```ts
optional propertyNames?: JSONSchema;
```

Defined in: [packages/ai/src/types.ts:117](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L117)

***

### required?

```ts
optional required?: string[];
```

Defined in: [packages/ai/src/types.ts:88](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L88)

***

### then?

```ts
optional then?: JSONSchema;
```

Defined in: [packages/ai/src/types.ts:101](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L101)

***

### title?

```ts
optional title?: string;
```

Defined in: [packages/ai/src/types.ts:120](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L120)

***

### type?

```ts
optional type?: string | string[];
```

Defined in: [packages/ai/src/types.ts:85](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L85)

***

### uniqueItems?

```ts
optional uniqueItems?: boolean;
```

Defined in: [packages/ai/src/types.ts:113](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L113)
