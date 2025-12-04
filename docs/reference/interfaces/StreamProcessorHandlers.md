---
id: StreamProcessorHandlers
title: StreamProcessorHandlers
---

# Interface: StreamProcessorHandlers

Defined in: [stream/processor.ts:88](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L88)

Legacy handlers for backward compatibility
These are the old callback-style handlers

## Properties

### onApprovalRequested()?

```ts
optional onApprovalRequested: (toolCallId, toolName, input, approvalId) => void;
```

Defined in: [stream/processor.ts:119](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L119)

#### Parameters

##### toolCallId

`string`

##### toolName

`string`

##### input

`any`

##### approvalId

`string`

#### Returns

`void`

***

### onError()?

```ts
optional onError: (error) => void;
```

Defined in: [stream/processor.ts:133](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L133)

#### Parameters

##### error

###### code?

`string`

###### message

`string`

#### Returns

`void`

***

### onStreamEnd()?

```ts
optional onStreamEnd: (content, toolCalls?) => void;
```

Defined in: [stream/processor.ts:132](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L132)

#### Parameters

##### content

`string`

##### toolCalls?

[`ToolCall`](./ToolCall.md)[]

#### Returns

`void`

***

### onTextUpdate()?

```ts
optional onTextUpdate: (content) => void;
```

Defined in: [stream/processor.ts:89](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L89)

#### Parameters

##### content

`string`

#### Returns

`void`

***

### onThinkingUpdate()?

```ts
optional onThinkingUpdate: (content) => void;
```

Defined in: [stream/processor.ts:90](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L90)

#### Parameters

##### content

`string`

#### Returns

`void`

***

### onToolCallComplete()?

```ts
optional onToolCallComplete: (index, id, name, args) => void;
```

Defined in: [stream/processor.ts:95](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L95)

#### Parameters

##### index

`number`

##### id

`string`

##### name

`string`

##### args

`string`

#### Returns

`void`

***

### onToolCallDelta()?

```ts
optional onToolCallDelta: (index, args) => void;
```

Defined in: [stream/processor.ts:94](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L94)

#### Parameters

##### index

`number`

##### args

`string`

#### Returns

`void`

***

### onToolCallStart()?

```ts
optional onToolCallStart: (index, id, name) => void;
```

Defined in: [stream/processor.ts:93](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L93)

#### Parameters

##### index

`number`

##### id

`string`

##### name

`string`

#### Returns

`void`

***

### onToolCallStateChange()?

```ts
optional onToolCallStateChange: (index, id, name, state, args, parsedArgs?) => void;
```

Defined in: [stream/processor.ts:101](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L101)

#### Parameters

##### index

`number`

##### id

`string`

##### name

`string`

##### state

[`ToolCallState`](../type-aliases/ToolCallState.md)

##### args

`string`

##### parsedArgs?

`any`

#### Returns

`void`

***

### onToolInputAvailable()?

```ts
optional onToolInputAvailable: (toolCallId, toolName, input) => void;
```

Defined in: [stream/processor.ts:125](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L125)

#### Parameters

##### toolCallId

`string`

##### toolName

`string`

##### input

`any`

#### Returns

`void`

***

### onToolResultStateChange()?

```ts
optional onToolResultStateChange: (toolCallId, content, state, error?) => void;
```

Defined in: [stream/processor.ts:111](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L111)

#### Parameters

##### toolCallId

`string`

##### content

`string`

##### state

[`ToolResultState`](../type-aliases/ToolResultState.md)

##### error?

`string`

#### Returns

`void`
