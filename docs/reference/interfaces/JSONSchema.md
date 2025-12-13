---
id: JSONSchema
title: JSONSchema
---

# Interface: JSONSchema

Defined in: [types.ts:9](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L9)

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

Defined in: [types.ts:19](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L19)

***

### $ref?

```ts
optional $ref: string;
```

Defined in: [types.ts:18](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L18)

***

### additionalItems?

```ts
optional additionalItems: boolean | JSONSchema;
```

Defined in: [types.ts:40](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L40)

***

### additionalProperties?

```ts
optional additionalProperties: boolean | JSONSchema;
```

Defined in: [types.ts:39](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L39)

***

### allOf?

```ts
optional allOf: JSONSchema[];
```

Defined in: [types.ts:21](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L21)

***

### anyOf?

```ts
optional anyOf: JSONSchema[];
```

Defined in: [types.ts:22](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L22)

***

### const?

```ts
optional const: any;
```

Defined in: [types.ts:15](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L15)

***

### default?

```ts
optional default: any;
```

Defined in: [types.ts:17](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L17)

***

### definitions?

```ts
optional definitions: Record<string, JSONSchema>;
```

Defined in: [types.ts:20](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L20)

***

### description?

```ts
optional description: string;
```

Defined in: [types.ts:16](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L16)

***

### else?

```ts
optional else: JSONSchema;
```

Defined in: [types.ts:27](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L27)

***

### enum?

```ts
optional enum: any[];
```

Defined in: [types.ts:14](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L14)

***

### examples?

```ts
optional examples: any[];
```

Defined in: [types.ts:46](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L46)

***

### exclusiveMaximum?

```ts
optional exclusiveMaximum: number;
```

Defined in: [types.ts:31](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L31)

***

### exclusiveMinimum?

```ts
optional exclusiveMinimum: number;
```

Defined in: [types.ts:30](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L30)

***

### format?

```ts
optional format: string;
```

Defined in: [types.ts:35](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L35)

***

### if?

```ts
optional if: JSONSchema;
```

Defined in: [types.ts:25](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L25)

***

### items?

```ts
optional items: JSONSchema | JSONSchema[];
```

Defined in: [types.ts:12](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L12)

***

### maximum?

```ts
optional maximum: number;
```

Defined in: [types.ts:29](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L29)

***

### maxItems?

```ts
optional maxItems: number;
```

Defined in: [types.ts:37](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L37)

***

### maxLength?

```ts
optional maxLength: number;
```

Defined in: [types.ts:33](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L33)

***

### maxProperties?

```ts
optional maxProperties: number;
```

Defined in: [types.ts:44](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L44)

***

### minimum?

```ts
optional minimum: number;
```

Defined in: [types.ts:28](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L28)

***

### minItems?

```ts
optional minItems: number;
```

Defined in: [types.ts:36](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L36)

***

### minLength?

```ts
optional minLength: number;
```

Defined in: [types.ts:32](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L32)

***

### minProperties?

```ts
optional minProperties: number;
```

Defined in: [types.ts:43](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L43)

***

### not?

```ts
optional not: JSONSchema;
```

Defined in: [types.ts:24](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L24)

***

### oneOf?

```ts
optional oneOf: JSONSchema[];
```

Defined in: [types.ts:23](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L23)

***

### pattern?

```ts
optional pattern: string;
```

Defined in: [types.ts:34](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L34)

***

### patternProperties?

```ts
optional patternProperties: Record<string, JSONSchema>;
```

Defined in: [types.ts:41](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L41)

***

### properties?

```ts
optional properties: Record<string, JSONSchema>;
```

Defined in: [types.ts:11](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L11)

***

### propertyNames?

```ts
optional propertyNames: JSONSchema;
```

Defined in: [types.ts:42](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L42)

***

### required?

```ts
optional required: string[];
```

Defined in: [types.ts:13](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L13)

***

### then?

```ts
optional then: JSONSchema;
```

Defined in: [types.ts:26](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L26)

***

### title?

```ts
optional title: string;
```

Defined in: [types.ts:45](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L45)

***

### type?

```ts
optional type: string | string[];
```

Defined in: [types.ts:10](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L10)

***

### uniqueItems?

```ts
optional uniqueItems: boolean;
```

Defined in: [types.ts:38](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L38)
