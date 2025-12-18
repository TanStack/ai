---
id: JSONSchema
title: JSONSchema
---

# Interface: JSONSchema

Defined in: [types.ts:85](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L85)

JSON Schema type for defining tool input/output schemas as raw JSON Schema objects.
This allows tools to be defined without Zod when you have JSON Schema definitions available.

## Indexable

```ts
[key: string]: any
```

## Properties

### $defs?

```ts
optional $defs: Record<string, JSONSchema>;
```

Defined in: [types.ts:95](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L95)

***

### $ref?

```ts
optional $ref: string;
```

Defined in: [types.ts:94](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L94)

***

### additionalItems?

```ts
optional additionalItems: boolean | JSONSchema;
```

Defined in: [types.ts:116](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L116)

***

### additionalProperties?

```ts
optional additionalProperties: boolean | JSONSchema;
```

Defined in: [types.ts:115](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L115)

***

### allOf?

```ts
optional allOf: JSONSchema[];
```

Defined in: [types.ts:97](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L97)

***

### anyOf?

```ts
optional anyOf: JSONSchema[];
```

Defined in: [types.ts:98](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L98)

***

### const?

```ts
optional const: any;
```

Defined in: [types.ts:91](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L91)

***

### default?

```ts
optional default: any;
```

Defined in: [types.ts:93](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L93)

***

### definitions?

```ts
optional definitions: Record<string, JSONSchema>;
```

Defined in: [types.ts:96](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L96)

***

### description?

```ts
optional description: string;
```

Defined in: [types.ts:92](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L92)

***

### else?

```ts
optional else: JSONSchema;
```

Defined in: [types.ts:103](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L103)

***

### enum?

```ts
optional enum: any[];
```

Defined in: [types.ts:90](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L90)

***

### examples?

```ts
optional examples: any[];
```

Defined in: [types.ts:122](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L122)

***

### exclusiveMaximum?

```ts
optional exclusiveMaximum: number;
```

Defined in: [types.ts:107](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L107)

***

### exclusiveMinimum?

```ts
optional exclusiveMinimum: number;
```

Defined in: [types.ts:106](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L106)

***

### format?

```ts
optional format: string;
```

Defined in: [types.ts:111](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L111)

***

### if?

```ts
optional if: JSONSchema;
```

Defined in: [types.ts:101](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L101)

***

### items?

```ts
optional items: JSONSchema | JSONSchema[];
```

Defined in: [types.ts:88](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L88)

***

### maximum?

```ts
optional maximum: number;
```

Defined in: [types.ts:105](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L105)

***

### maxItems?

```ts
optional maxItems: number;
```

Defined in: [types.ts:113](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L113)

***

### maxLength?

```ts
optional maxLength: number;
```

Defined in: [types.ts:109](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L109)

***

### maxProperties?

```ts
optional maxProperties: number;
```

Defined in: [types.ts:120](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L120)

***

### minimum?

```ts
optional minimum: number;
```

Defined in: [types.ts:104](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L104)

***

### minItems?

```ts
optional minItems: number;
```

Defined in: [types.ts:112](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L112)

***

### minLength?

```ts
optional minLength: number;
```

Defined in: [types.ts:108](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L108)

***

### minProperties?

```ts
optional minProperties: number;
```

Defined in: [types.ts:119](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L119)

***

### not?

```ts
optional not: JSONSchema;
```

Defined in: [types.ts:100](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L100)

***

### oneOf?

```ts
optional oneOf: JSONSchema[];
```

Defined in: [types.ts:99](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L99)

***

### pattern?

```ts
optional pattern: string;
```

Defined in: [types.ts:110](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L110)

***

### patternProperties?

```ts
optional patternProperties: Record<string, JSONSchema>;
```

Defined in: [types.ts:117](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L117)

***

### properties?

```ts
optional properties: Record<string, JSONSchema>;
```

Defined in: [types.ts:87](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L87)

***

### propertyNames?

```ts
optional propertyNames: JSONSchema;
```

Defined in: [types.ts:118](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L118)

***

### required?

```ts
optional required: string[];
```

Defined in: [types.ts:89](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L89)

***

### then?

```ts
optional then: JSONSchema;
```

Defined in: [types.ts:102](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L102)

***

### title?

```ts
optional title: string;
```

Defined in: [types.ts:121](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L121)

***

### type?

```ts
optional type: string | string[];
```

Defined in: [types.ts:86](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L86)

***

### uniqueItems?

```ts
optional uniqueItems: boolean;
```

Defined in: [types.ts:114](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L114)
