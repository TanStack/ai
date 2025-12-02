---
id: JSONParser
title: JSONParser
---

# Interface: JSONParser

Defined in: [stream/json-parser.ts:12](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/json-parser.ts#L12)

JSON Parser interface - allows for custom parser implementations

## Properties

### parse()

```ts
parse: (jsonString) => any;
```

Defined in: [stream/json-parser.ts:18](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/json-parser.ts#L18)

Parse a JSON string (may be incomplete/partial)

#### Parameters

##### jsonString

`string`

The JSON string to parse

#### Returns

`any`

The parsed object, or undefined if parsing fails
