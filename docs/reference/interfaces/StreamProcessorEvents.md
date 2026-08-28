---
id: StreamProcessorEvents
title: StreamProcessorEvents
---

# Interface: StreamProcessorEvents

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:78](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L78)

Events emitted by the StreamProcessor

## Properties

### onApprovalRequest?

```ts
optional onApprovalRequest?: (args) => void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:93](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L93)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:101](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L101)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:85](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L85)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:80](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L80)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:84](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L84)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:83](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L83)

#### Returns

`void`

***

### onStructuredOutputChange?

```ts
optional onStructuredOutputChange?: (args) => void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:120](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L120)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:108](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L108)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:115](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L115)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:88](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L88)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:109](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L109)

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
