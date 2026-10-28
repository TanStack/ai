---
id: JSONParser
title: JSONParser
---

Defined in: packages/ai/src/activities/chat/stream/json-parser.ts:12

JSON Parser interface - allows for custom parser implementations

## Properties

### parse

```ts
parse: (jsonString) => any;
```

Defined in: packages/ai/src/activities/chat/stream/json-parser.ts:18

Parse a JSON string (may be incomplete/partial)

#### Parameters

##### jsonString

`string`

The JSON string to parse

#### Returns

`any`

The parsed object, or undefined if parsing fails
