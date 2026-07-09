---
id: StreamProcessorEvents
title: StreamProcessorEvents
---

# Interface: StreamProcessorEvents

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:67](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L67)

Events emitted by the StreamProcessor

## Properties

### onApprovalRequest()?

```ts
optional onApprovalRequest: (args) => void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:82](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L82)

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

### onCustomEvent()?

```ts
optional onCustomEvent: (eventType, data, context) => void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:90](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L90)

#### Parameters

##### eventType

`string`

##### data

`unknown`

##### context

###### toolCallId?

`string`

#### Returns

`void`

***

### onError()?

```ts
optional onError: (error) => void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:74](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L74)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:69](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L69)

#### Parameters

##### messages

[`UIMessage`](UIMessage.md)\<`unknown`\>[]

#### Returns

`void`

***

### onStreamEnd()?

```ts
optional onStreamEnd: (message) => void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:73](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L73)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:72](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L72)

#### Returns

`void`

***

### onStructuredOutputChange()?

```ts
optional onStructuredOutputChange: (args) => void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:109](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L109)

#### Parameters

##### args

###### data?

`unknown`

###### delta?

`string`

###### errorMessage?

`string`

###### messageId

`string`

###### partial?

`unknown`

###### phase

`"error"` \| `"complete"` \| `"start"` \| `"update"`

###### raw

`string`

###### reasoning?

`string`

###### status

`"error"` \| `"complete"` \| `"streaming"`

#### Returns

`void`

***

### onTextUpdate()?

```ts
optional onTextUpdate: (messageId, content) => void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:97](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L97)

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
optional onThinkingUpdate: (messageId, stepId, content) => void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:104](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L104)

#### Parameters

##### messageId

`string`

##### stepId

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:77](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L77)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:98](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L98)

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
