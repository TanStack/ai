---
id: RealtimeSessionConfig
title: RealtimeSessionConfig
---

# Interface: RealtimeSessionConfig

Defined in: [packages/ai/src/realtime/types.ts:35](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L35)

Configuration for a realtime session

## Properties

### instructions?

```ts
optional instructions: string;
```

Defined in: [packages/ai/src/realtime/types.ts:41](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L41)

System instructions for the assistant

***

### maxOutputTokens?

```ts
optional maxOutputTokens: number | "inf";
```

Defined in: [packages/ai/src/realtime/types.ts:53](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L53)

Maximum number of tokens in a response

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/realtime/types.ts:37](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L37)

Model to use for the session

***

### outputModalities?

```ts
optional outputModalities: ("text" | "audio")[];
```

Defined in: [packages/ai/src/realtime/types.ts:49](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L49)

Output modalities for responses (e.g., ['audio', 'text'], ['text'])

***

### providerOptions?

```ts
optional providerOptions: Record<string, any>;
```

Defined in: [packages/ai/src/realtime/types.ts:57](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L57)

Provider-specific options

***

### semanticEagerness?

```ts
optional semanticEagerness: "high" | "low" | "medium";
```

Defined in: [packages/ai/src/realtime/types.ts:55](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L55)

Eagerness level for semantic VAD ('low', 'medium', 'high')

***

### temperature?

```ts
optional temperature: number;
```

Defined in: [packages/ai/src/realtime/types.ts:51](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L51)

Temperature for generation (provider-specific range, e.g., 0.6-1.2 for OpenAI)

***

### tools?

```ts
optional tools: RealtimeToolConfig[];
```

Defined in: [packages/ai/src/realtime/types.ts:43](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L43)

Tools available in the session

***

### vadConfig?

```ts
optional vadConfig: VADConfig;
```

Defined in: [packages/ai/src/realtime/types.ts:47](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L47)

VAD configuration

***

### vadMode?

```ts
optional vadMode: "server" | "manual" | "semantic";
```

Defined in: [packages/ai/src/realtime/types.ts:45](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L45)

VAD mode

***

### voice?

```ts
optional voice: string;
```

Defined in: [packages/ai/src/realtime/types.ts:39](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L39)

Voice to use for audio output
