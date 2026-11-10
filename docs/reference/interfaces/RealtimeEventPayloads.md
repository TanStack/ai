---
id: RealtimeEventPayloads
title: RealtimeEventPayloads
---

Defined in: [packages/ai/src/realtime/types.ts:267](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L267)

Event payloads for realtime events

## Properties

### audio\_chunk

```ts
audio_chunk: object;
```

Defined in: [packages/ai/src/realtime/types.ts:275](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L275)

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

Defined in: [packages/ai/src/realtime/types.ts:279](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L279)

#### error

```ts
error: Error;
```

***

### go\_away

```ts
go_away: object;
```

Defined in: [packages/ai/src/realtime/types.ts:280](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L280)

#### timeLeft?

```ts
optional timeLeft?: string;
```

***

### interrupted

```ts
interrupted: object;
```

Defined in: [packages/ai/src/realtime/types.ts:278](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L278)

#### messageId?

```ts
optional messageId?: string;
```

***

### message\_complete

```ts
message_complete: object;
```

Defined in: [packages/ai/src/realtime/types.ts:277](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L277)

#### message

```ts
message: RealtimeMessage;
```

***

### mode\_change

```ts
mode_change: object;
```

Defined in: [packages/ai/src/realtime/types.ts:269](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L269)

#### mode

```ts
mode: RealtimeMode;
```

***

### status\_change

```ts
status_change: object;
```

Defined in: [packages/ai/src/realtime/types.ts:268](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L268)

#### status

```ts
status: RealtimeStatus;
```

***

### tool\_call

```ts
tool_call: object;
```

Defined in: [packages/ai/src/realtime/types.ts:276](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L276)

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

Defined in: [packages/ai/src/realtime/types.ts:270](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L270)

#### isFinal

```ts
isFinal: boolean;
```

#### role

```ts
role: "assistant" | "user";
```

#### transcript

```ts
transcript: string;
```

***

### usage

```ts
usage: UsageInfo;
```

Defined in: [packages/ai/src/realtime/types.ts:281](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L281)
