---
id: StreamProcessorEvents
title: StreamProcessorEvents
---

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:84](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L84)

Events emitted by the StreamProcessor

## Properties

### onApprovalRequest?

```ts
optional onApprovalRequest?: (args) => void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:99](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L99)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:107](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L107)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:91](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L91)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:86](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L86)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:90](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L90)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:89](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L89)

#### Returns

`void`

***

### onStructuredOutputChange?

```ts
optional onStructuredOutputChange?: (args) => void;
```

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:126](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L126)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:114](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L114)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:121](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L121)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:94](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L94)

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

Defined in: [packages/ai/src/activities/chat/stream/processor.ts:115](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/stream/processor.ts#L115)

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
