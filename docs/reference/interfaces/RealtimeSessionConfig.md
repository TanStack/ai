---
id: RealtimeSessionConfig
title: RealtimeSessionConfig
---

# Interface: RealtimeSessionConfig

Defined in: [realtime/types.ts](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts)

Configuration for a realtime session. Passed to the provider to configure model behavior, voice, tools, and VAD settings.

## Properties

### model?

```ts
optional model: string;
```

Model to use for the session.

***

### voice?

```ts
optional voice: string;
```

Voice to use for audio output.

***

### instructions?

```ts
optional instructions: string;
```

System instructions for the assistant.

***

### tools?

```ts
optional tools: Array<RealtimeToolConfig>;
```

Tools available in the session.

***

### vadMode?

```ts
optional vadMode: 'server' | 'semantic' | 'manual';
```

Voice activity detection mode.

***

### vadConfig?

```ts
optional vadConfig: VADConfig;
```

Detailed VAD configuration (threshold, padding, silence duration).

***

### outputModalities?

```ts
optional outputModalities: Array<'audio' | 'text'>;
```

Output modalities for responses (e.g., `['audio', 'text']`).

***

### temperature?

```ts
optional temperature: number;
```

Temperature for generation (provider-specific range, e.g., 0.6-1.2 for OpenAI).

***

### maxOutputTokens?

```ts
optional maxOutputTokens: number | 'inf';
```

Maximum number of tokens in a response.

***

### semanticEagerness?

```ts
optional semanticEagerness: 'low' | 'medium' | 'high';
```

Eagerness level for semantic VAD.

***

### providerOptions?

```ts
optional providerOptions: Record<string, any>;
```

Provider-specific options.
