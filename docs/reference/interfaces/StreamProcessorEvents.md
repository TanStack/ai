---
id: StreamProcessorEvents
title: StreamProcessorEvents
---

# Interface: StreamProcessorEvents

Defined in: [activities/chat/stream/processor.ts:48](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L48)

Events emitted by the StreamProcessor

## Properties

### onApprovalRequest()?

```ts
optional onApprovalRequest: (args) => void;
```

Defined in: [activities/chat/stream/processor.ts:63](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L63)

#### Parameters

##### args

###### approvalId

`string`

###### input

`any`

###### toolCallId

`string`

###### toolName

`string`

#### Returns

`void`

***

### onError()?

```ts
optional onError: (error) => void;
```

Defined in: [activities/chat/stream/processor.ts:55](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L55)

#### Parameters

##### error

`Error`

#### Returns

`void`

***

### onMessagesChange()?

```ts
optional onMessagesChange: (messages) => void;
```

Defined in: [activities/chat/stream/processor.ts:50](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L50)

#### Parameters

##### messages

[`UIMessage`](UIMessage.md)[]

#### Returns

`void`

***

### onStreamEnd()?

```ts
optional onStreamEnd: (message) => void;
```

Defined in: [activities/chat/stream/processor.ts:54](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L54)

#### Parameters

##### message

[`UIMessage`](UIMessage.md)

#### Returns

`void`

***

### onStreamStart()?

```ts
optional onStreamStart: () => void;
```

Defined in: [activities/chat/stream/processor.ts:53](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L53)

#### Returns

`void`

***

### onTextUpdate()?

```ts
optional onTextUpdate: (messageId, content) => void;
```

Defined in: [activities/chat/stream/processor.ts:71](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L71)

#### Parameters

##### messageId

`string`

##### content

`string`

#### Returns

`void`

***

### onThinkingUpdate()?

```ts
optional onThinkingUpdate: (messageId, content) => void;
```

Defined in: [activities/chat/stream/processor.ts:78](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L78)

#### Parameters

##### messageId

`string`

##### content

`string`

#### Returns

`void`

***

### onToolCall()?

```ts
optional onToolCall: (args) => void;
```

Defined in: [activities/chat/stream/processor.ts:58](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L58)

#### Parameters

##### args

###### input

`any`

###### toolCallId

`string`

###### toolName

`string`

#### Returns

`void`

***

### onToolCallStateChange()?

```ts
optional onToolCallStateChange: (messageId, toolCallId, state, args) => void;
```

Defined in: [activities/chat/stream/processor.ts:72](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/processor.ts#L72)

#### Parameters

##### messageId

`string`

##### toolCallId

`string`

##### state

[`ToolCallState`](../type-aliases/ToolCallState.md)

##### args

`string`

#### Returns

`void`
