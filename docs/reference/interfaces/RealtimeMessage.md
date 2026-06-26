---
id: RealtimeMessage
title: RealtimeMessage
---

# Interface: RealtimeMessage

Defined in: [packages/ai/src/realtime/types.ts:159](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L159)

A message in a realtime conversation

## Properties

### audioId?

```ts
optional audioId: string;
```

Defined in: [packages/ai/src/realtime/types.ts:171](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L171)

Reference to audio buffer if stored

***

### durationMs?

```ts
optional durationMs: number;
```

Defined in: [packages/ai/src/realtime/types.ts:173](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L173)

Duration of the audio in milliseconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/realtime/types.ts:161](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L161)

Unique message identifier

***

### interrupted?

```ts
optional interrupted: boolean;
```

Defined in: [packages/ai/src/realtime/types.ts:169](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L169)

Whether this message was interrupted

***

### parts

```ts
parts: RealtimeMessagePart[];
```

Defined in: [packages/ai/src/realtime/types.ts:167](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L167)

Content parts of the message

***

### role

```ts
role: "user" | "assistant";
```

Defined in: [packages/ai/src/realtime/types.ts:163](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L163)

Message role

***

### timestamp

```ts
timestamp: number;
```

Defined in: [packages/ai/src/realtime/types.ts:165](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L165)

Timestamp when the message was created
