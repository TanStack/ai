---
id: RealtimeEventPayloads
title: RealtimeEventPayloads
---

# Interface: RealtimeEventPayloads

Defined in: [packages/ai/src/realtime/types.ts:253](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L253)

Event payloads for realtime events

## Properties

### audio\_chunk

```ts
audio_chunk: object;
```

Defined in: [packages/ai/src/realtime/types.ts:261](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L261)

#### data

```ts
data: ArrayBuffer;
```

#### sampleRate

```ts
sampleRate: number;
```

***

### error

```ts
error: object;
```

Defined in: [packages/ai/src/realtime/types.ts:265](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L265)

#### error

```ts
error: Error;
```

***

### interrupted

```ts
interrupted: object;
```

Defined in: [packages/ai/src/realtime/types.ts:264](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L264)

#### messageId?

```ts
optional messageId: string;
```

***

### message\_complete

```ts
message_complete: object;
```

Defined in: [packages/ai/src/realtime/types.ts:263](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L263)

#### message

```ts
message: RealtimeMessage;
```

***

### mode\_change

```ts
mode_change: object;
```

Defined in: [packages/ai/src/realtime/types.ts:255](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L255)

#### mode

```ts
mode: RealtimeMode;
```

***

### status\_change

```ts
status_change: object;
```

Defined in: [packages/ai/src/realtime/types.ts:254](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L254)

#### status

```ts
status: RealtimeStatus;
```

***

### tool\_call

```ts
tool_call: object;
```

Defined in: [packages/ai/src/realtime/types.ts:262](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L262)

#### input

```ts
input: unknown;
```

#### toolCallId

```ts
toolCallId: string;
```

#### toolName

```ts
toolName: string;
```

***

### transcript

```ts
transcript: object;
```

Defined in: [packages/ai/src/realtime/types.ts:256](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L256)

#### isFinal

```ts
isFinal: boolean;
```

#### role

```ts
role: "user" | "assistant";
```

#### transcript

```ts
transcript: string;
```
