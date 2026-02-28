---
id: JSONSchema
title: JSONSchema
---

# Interface: JSONSchema

Defined in: [types.ts:25](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L25)

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

Defined in: [types.ts:35](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L35)

***

### $ref?

```ts
optional $ref: string;
```

Defined in: [types.ts:34](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L34)

***

### additionalItems?

```ts
optional additionalItems: boolean | JSONSchema;
```

Defined in: [types.ts:56](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L56)

***

### additionalProperties?

```ts
optional additionalProperties: boolean | JSONSchema;
```

Defined in: [types.ts:55](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L55)

***

### allOf?

```ts
optional allOf: JSONSchema[];
```

Defined in: [types.ts:37](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L37)

***

### anyOf?

```ts
optional anyOf: JSONSchema[];
```

Defined in: [types.ts:38](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L38)

***

### const?

```ts
optional const: unknown;
```

Defined in: [types.ts:31](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L31)

***

### default?

```ts
optional default: unknown;
```

Defined in: [types.ts:33](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L33)

***

### definitions?

```ts
optional definitions: Record<string, JSONSchema>;
```

Defined in: [types.ts:36](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L36)

***

### description?

```ts
optional description: string;
```

Defined in: [types.ts:32](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L32)

***

### else?

```ts
optional else: JSONSchema;
```

Defined in: [types.ts:43](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L43)

***

### enum?

```ts
optional enum: unknown[];
```

Defined in: [types.ts:30](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L30)

***

### examples?

```ts
optional examples: unknown[];
```

Defined in: [types.ts:62](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L62)

***

### exclusiveMaximum?

```ts
optional exclusiveMaximum: number;
```

Defined in: [types.ts:47](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L47)

***

### exclusiveMinimum?

```ts
optional exclusiveMinimum: number;
```

Defined in: [types.ts:46](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L46)

***

### format?

```ts
optional format: string;
```

Defined in: [types.ts:51](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L51)

***

### if?

```ts
optional if: JSONSchema;
```

Defined in: [types.ts:41](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L41)

***

### items?

```ts
optional items: JSONSchema | JSONSchema[];
```

Defined in: [types.ts:28](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L28)

***

### maximum?

```ts
optional maximum: number;
```

Defined in: [types.ts:45](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L45)

***

### maxItems?

```ts
optional maxItems: number;
```

Defined in: [types.ts:53](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L53)

***

### maxLength?

```ts
optional maxLength: number;
```

Defined in: [types.ts:49](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L49)

***

### maxProperties?

```ts
optional maxProperties: number;
```

Defined in: [types.ts:60](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L60)

***

### minimum?

```ts
optional minimum: number;
```

Defined in: [types.ts:44](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L44)

***

### minItems?

```ts
optional minItems: number;
```

Defined in: [types.ts:52](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L52)

***

### minLength?

```ts
optional minLength: number;
```

Defined in: [types.ts:48](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L48)

***

### minProperties?

```ts
optional minProperties: number;
```

Defined in: [types.ts:59](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L59)

***

### not?

```ts
optional not: JSONSchema;
```

Defined in: [types.ts:40](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L40)

***

### oneOf?

```ts
optional oneOf: JSONSchema[];
```

Defined in: [types.ts:39](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L39)

***

### pattern?

```ts
optional pattern: string;
```

Defined in: [types.ts:50](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L50)

***

### patternProperties?

```ts
optional patternProperties: Record<string, JSONSchema>;
```

Defined in: [types.ts:57](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L57)

***

### properties?

```ts
optional properties: Record<string, JSONSchema>;
```

Defined in: [types.ts:27](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L27)

***

### propertyNames?

```ts
optional propertyNames: JSONSchema;
```

Defined in: [types.ts:58](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L58)

***

### required?

```ts
optional required: string[];
```

Defined in: [types.ts:29](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L29)

***

### then?

```ts
optional then: JSONSchema;
```

Defined in: [types.ts:42](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L42)

***

### title?

```ts
optional title: string;
```

Defined in: [types.ts:61](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L61)

***

### type?

```ts
optional type: string | string[];
```

Defined in: [types.ts:26](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L26)

***

### uniqueItems?

```ts
optional uniqueItems: boolean;
```

Defined in: [types.ts:54](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L54)
