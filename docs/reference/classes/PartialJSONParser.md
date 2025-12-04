---
id: PartialJSONParser
title: PartialJSONParser
---

# Class: PartialJSONParser

Defined in: [stream/json-parser.ts:25](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/json-parser.ts#L25)

Partial JSON Parser implementation using the partial-json library
This parser can handle incomplete JSON strings during streaming

## Implements

- [`JSONParser`](../interfaces/JSONParser.md)

## Constructors

### Constructor

```ts
new PartialJSONParser(): PartialJSONParser;
```

#### Returns

`PartialJSONParser`

## Methods

### parse()

```ts
parse(jsonString): any;
```

Defined in: [stream/json-parser.ts:31](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/json-parser.ts#L31)

Parse a potentially incomplete JSON string

#### Parameters

##### jsonString

`string`

The JSON string to parse (may be incomplete)

#### Returns

`any`

The parsed object, or undefined if parsing fails

#### Implementation of

[`JSONParser`](../interfaces/JSONParser.md).[`parse`](../interfaces/JSONParser.md#parse)
