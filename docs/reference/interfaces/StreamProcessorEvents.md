---
id: StreamProcessorEvents
title: StreamProcessorEvents
---

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:101](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L101)

Events emitted by the StreamProcessor

## Properties

### onApprovalRequest?

```ts
optional onApprovalRequest?: (args) => void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:116](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L116)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:124](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L124)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:108](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L108)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:103](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L103)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:107](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L107)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:106](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L106)

#### Returns

`void`

***

### onStructuredOutputChange?

```ts
optional onStructuredOutputChange?: (args) => void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:143](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L143)

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

`"error"` \| `"complete"` \| `"update"` \| `"start"`

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:131](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L131)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:138](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L138)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:111](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L111)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:132](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L132)

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
