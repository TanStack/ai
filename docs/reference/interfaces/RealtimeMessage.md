---
id: RealtimeMessage
title: RealtimeMessage
---

# Interface: RealtimeMessage

Defined in: [realtime/types.ts](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts)

A message in a realtime conversation. Contains one or more content parts representing text, audio, tool calls, or images.

## Properties

### id

```ts
id: string;
```

Unique message identifier.

***

### role

```ts
role: 'user' | 'assistant';
```

Message role.

***

### timestamp

```ts
timestamp: number;
```

Timestamp when the message was created (milliseconds since epoch).

***

### parts

```ts
parts: Array<RealtimeMessagePart>;
```

Content parts of the message. Can include `RealtimeTextPart`, `RealtimeAudioPart`, `RealtimeToolCallPart`, `RealtimeToolResultPart`, or `RealtimeImagePart`.

***

### interrupted?

```ts
optional interrupted: boolean;
```

Whether this message was interrupted by the user.

***

### audioId?

```ts
optional audioId: string;
```

Reference to audio buffer if stored.

***

### durationMs?

```ts
optional durationMs: number;
```

Duration of the audio in milliseconds.
