---
id: RealtimeEventPayloads
title: RealtimeEventPayloads
---

# Interface: RealtimeEventPayloads

Defined in: [packages/typescript/ai/src/realtime/types.ts:251](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L251)

Event payloads for realtime events

## Properties

### audio\_chunk

```ts
audio_chunk: object;
```

Defined in: [packages/typescript/ai/src/realtime/types.ts:259](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L259)

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

Defined in: [packages/typescript/ai/src/realtime/types.ts:263](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L263)

#### error

```ts
error: Error;
```

***

### interrupted

```ts
interrupted: object;
```

Defined in: [packages/typescript/ai/src/realtime/types.ts:262](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L262)

#### messageId?

```ts
optional messageId: string;
```

***

### message\_complete

```ts
message_complete: object;
```

Defined in: [packages/typescript/ai/src/realtime/types.ts:261](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L261)

#### message

```ts
message: RealtimeMessage;
```

***

### mode\_change

```ts
mode_change: object;
```

Defined in: [packages/typescript/ai/src/realtime/types.ts:253](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L253)

#### mode

```ts
mode: RealtimeMode;
```

***

### status\_change

```ts
status_change: object;
```

Defined in: [packages/typescript/ai/src/realtime/types.ts:252](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L252)

#### status

```ts
status: RealtimeStatus;
```

***

### tool\_call

```ts
tool_call: object;
```

Defined in: [packages/typescript/ai/src/realtime/types.ts:260](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L260)

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

Defined in: [packages/typescript/ai/src/realtime/types.ts:254](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L254)

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
