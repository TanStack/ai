---
id: RealtimeMessage
title: RealtimeMessage
---

Defined in: [packages/ai/src/realtime/types.ts:171](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L171)

A message in a realtime conversation

## Properties

### audioId?

```ts
optional audioId?: string;
```

Defined in: [packages/ai/src/realtime/types.ts:183](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L183)

Reference to audio buffer if stored

***

### durationMs?

```ts
optional durationMs?: number;
```

Defined in: [packages/ai/src/realtime/types.ts:185](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L185)

Duration of the audio in milliseconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/realtime/types.ts:173](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L173)

Unique message identifier

***

### interrupted?

```ts
optional interrupted?: boolean;
```

Defined in: [packages/ai/src/realtime/types.ts:181](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L181)

Whether this message was interrupted

***

### parts

```ts
parts: RealtimeMessagePart[];
```

Defined in: [packages/ai/src/realtime/types.ts:179](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L179)

Content parts of the message

***

### role

```ts
role: "assistant" | "user";
```

Defined in: [packages/ai/src/realtime/types.ts:175](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L175)

Message role

***

### timestamp

```ts
timestamp: number;
```

Defined in: [packages/ai/src/realtime/types.ts:177](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L177)

Timestamp when the message was created
