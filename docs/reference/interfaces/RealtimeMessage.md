---
id: RealtimeMessage
title: RealtimeMessage
---

# Interface: RealtimeMessage

Defined in: [packages/ai/src/realtime/types.ts:162](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L162)

A message in a realtime conversation

## Properties

### audioId?

```ts
optional audioId: string;
```

Defined in: [packages/ai/src/realtime/types.ts:174](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L174)

Reference to audio buffer if stored

***

### durationMs?

```ts
optional durationMs: number;
```

Defined in: [packages/ai/src/realtime/types.ts:176](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L176)

Duration of the audio in milliseconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/realtime/types.ts:164](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L164)

Unique message identifier

***

### interrupted?

```ts
optional interrupted: boolean;
```

Defined in: [packages/ai/src/realtime/types.ts:172](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L172)

Whether this message was interrupted

***

### parts

```ts
parts: RealtimeMessagePart[];
```

Defined in: [packages/ai/src/realtime/types.ts:170](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L170)

Content parts of the message

***

### role

```ts
role: "user" | "assistant";
```

Defined in: [packages/ai/src/realtime/types.ts:166](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L166)

Message role

***

### timestamp

```ts
timestamp: number;
```

Defined in: [packages/ai/src/realtime/types.ts:168](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L168)

Timestamp when the message was created
