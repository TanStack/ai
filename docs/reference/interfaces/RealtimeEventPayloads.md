---
id: RealtimeEventPayloads
title: RealtimeEventPayloads
---

Defined in: packages/ai/src/realtime/types.ts:258

Event payloads for realtime events

## Properties

### audio\_chunk

```ts
audio_chunk: object;
```

Defined in: packages/ai/src/realtime/types.ts:266

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

Defined in: packages/ai/src/realtime/types.ts:270

#### error

```ts
error: Error;
```

***

### go\_away

```ts
go_away: object;
```

Defined in: packages/ai/src/realtime/types.ts:271

#### timeLeft?

```ts
optional timeLeft?: string;
```

***

### interrupted

```ts
interrupted: object;
```

Defined in: packages/ai/src/realtime/types.ts:269

#### messageId?

```ts
optional messageId?: string;
```

***

### message\_complete

```ts
message_complete: object;
```

Defined in: packages/ai/src/realtime/types.ts:268

#### message

```ts
message: RealtimeMessage;
```

***

### mode\_change

```ts
mode_change: object;
```

Defined in: packages/ai/src/realtime/types.ts:260

#### mode

```ts
mode: RealtimeMode;
```

***

### status\_change

```ts
status_change: object;
```

Defined in: packages/ai/src/realtime/types.ts:259

#### status

```ts
status: RealtimeStatus;
```

***

### tool\_call

```ts
tool_call: object;
```

Defined in: packages/ai/src/realtime/types.ts:267

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

Defined in: packages/ai/src/realtime/types.ts:261

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

Defined in: packages/ai/src/realtime/types.ts:272
