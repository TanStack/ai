---
id: RealtimeSessionConfig
title: RealtimeSessionConfig
---

Defined in: packages/ai/src/realtime/types.ts:35

Configuration for a realtime session

## Properties

### instructions?

```ts
optional instructions?: string;
```

Defined in: packages/ai/src/realtime/types.ts:41

System instructions for the assistant

***

### maxOutputTokens?

```ts
optional maxOutputTokens?: number | "inf";
```

Defined in: packages/ai/src/realtime/types.ts:53

Maximum number of tokens in a response

***

### model?

```ts
optional model?: string;
```

Defined in: packages/ai/src/realtime/types.ts:37

Model to use for the session

***

### outputModalities?

```ts
optional outputModalities?: ("text" | "audio")[];
```

Defined in: packages/ai/src/realtime/types.ts:49

Output modalities for responses (e.g., ['audio', 'text'], ['text'])

***

### providerOptions?

```ts
optional providerOptions?: Record<string, any>;
```

Defined in: packages/ai/src/realtime/types.ts:57

Provider-specific options

***

### semanticEagerness?

```ts
optional semanticEagerness?: "low" | "medium" | "high";
```

Defined in: packages/ai/src/realtime/types.ts:55

Eagerness level for semantic VAD ('low', 'medium', 'high')

***

### temperature?

```ts
optional temperature?: number;
```

Defined in: packages/ai/src/realtime/types.ts:51

Temperature for generation (provider-specific range, e.g., 0.6-1.2 for OpenAI)

***

### tools?

```ts
optional tools?: RealtimeToolConfig[];
```

Defined in: packages/ai/src/realtime/types.ts:43

Tools available in the session

***

### vadConfig?

```ts
optional vadConfig?: VADConfig;
```

Defined in: packages/ai/src/realtime/types.ts:47

VAD configuration

***

### vadMode?

```ts
optional vadMode?: "server" | "manual" | "semantic";
```

Defined in: packages/ai/src/realtime/types.ts:45

VAD mode

***

### voice?

```ts
optional voice?: string;
```

Defined in: packages/ai/src/realtime/types.ts:39

Voice to use for audio output
