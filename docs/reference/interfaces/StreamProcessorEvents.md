---
id: StreamProcessorEvents
title: StreamProcessorEvents
---

# Interface: StreamProcessorEvents

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:77](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L77)

Events emitted by the StreamProcessor

## Properties

### onApprovalRequest?

```ts
optional onApprovalRequest?: (args) => void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:92](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L92)

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

### onCustomEvent?

```ts
optional onCustomEvent?: (eventType, data, context) => void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:100](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L100)

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

### onError?

```ts
optional onError?: (error) => void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:84](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L84)

#### Parameters

##### error

`Error`

#### Returns

`void`

***

### onMessagesChange?

```ts
optional onMessagesChange?: (messages) => void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:79](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L79)

#### Parameters

##### messages

[`UIMessage`](UIMessage.md)\<`unknown`\>[]

#### Returns

`void`

***

### onStreamEnd?

```ts
optional onStreamEnd?: (message) => void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:83](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L83)

#### Parameters

##### message

[`UIMessage`](UIMessage.md)

#### Returns

`void`

***

### onStreamStart?

```ts
optional onStreamStart?: () => void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:82](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L82)

#### Returns

`void`

***

### onStructuredOutputChange?

```ts
optional onStructuredOutputChange?: (args) => void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:119](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L119)

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

### onTextUpdate?

```ts
optional onTextUpdate?: (messageId, content) => void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:107](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L107)

#### Parameters

##### messageId

`string`

##### content

`string`

#### Returns

`void`

***

### onThinkingUpdate?

```ts
optional onThinkingUpdate?: (messageId, stepId, content) => void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:114](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L114)

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

### onToolCall?

```ts
optional onToolCall?: (args) => void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:87](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L87)

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

### onToolCallStateChange?

```ts
optional onToolCallStateChange?: (messageId, toolCallId, state, args) => void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:108](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L108)

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
