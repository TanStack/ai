---
id: StreamProcessorEvents
title: StreamProcessorEvents
---

# Interface: StreamProcessorEvents

Defined in: [stream/processor.ts:51](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L51)

Events emitted by the StreamProcessor

## Properties

### onApprovalRequest()?

```ts
optional onApprovalRequest: (args) => void;
```

Defined in: [stream/processor.ts:66](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L66)

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

Defined in: [stream/processor.ts:58](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L58)

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

Defined in: [stream/processor.ts:53](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L53)

#### Parameters

##### messages

[`UIMessage`](./UIMessage.md)[]

#### Returns

`void`

***

### onStreamEnd()?

```ts
optional onStreamEnd: (message) => void;
```

Defined in: [stream/processor.ts:57](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L57)

#### Parameters

##### message

[`UIMessage`](./UIMessage.md)

#### Returns

`void`

***

### onStreamStart()?

```ts
optional onStreamStart: () => void;
```

Defined in: [stream/processor.ts:56](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L56)

#### Returns

`void`

***

### onTextUpdate()?

```ts
optional onTextUpdate: (messageId, content) => void;
```

Defined in: [stream/processor.ts:74](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L74)

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

Defined in: [stream/processor.ts:81](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L81)

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

Defined in: [stream/processor.ts:61](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L61)

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

Defined in: [stream/processor.ts:75](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/processor.ts#L75)

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
