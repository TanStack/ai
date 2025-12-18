---
id: StreamProcessorHandlers
title: StreamProcessorHandlers
---

# Interface: StreamProcessorHandlers

Defined in: [activities/chat/stream/processor.ts:85](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L85)

Legacy handlers for backward compatibility
These are the old callback-style handlers

## Properties

### onApprovalRequested()?

```ts
optional onApprovalRequested: (toolCallId, toolName, input, approvalId) => void;
```

Defined in: [activities/chat/stream/processor.ts:116](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L116)

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

Defined in: [activities/chat/stream/processor.ts:130](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L130)

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

Defined in: [activities/chat/stream/processor.ts:129](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L129)

#### Parameters

##### content

`string`

##### toolCalls?

[`ToolCall`](ToolCall.md)[]

#### Returns

`void`

***

### onTextUpdate()?

```ts
optional onTextUpdate: (content) => void;
```

Defined in: [activities/chat/stream/processor.ts:86](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L86)

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

Defined in: [activities/chat/stream/processor.ts:87](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L87)

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

Defined in: [activities/chat/stream/processor.ts:92](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L92)

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

Defined in: [activities/chat/stream/processor.ts:91](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L91)

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

Defined in: [activities/chat/stream/processor.ts:90](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L90)

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

Defined in: [activities/chat/stream/processor.ts:98](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L98)

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

Defined in: [activities/chat/stream/processor.ts:122](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L122)

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

Defined in: [activities/chat/stream/processor.ts:108](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L108)

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
